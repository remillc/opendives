// SPDX-License-Identifier: GPL-2.0
import BackgroundTasks
import Foundation
import Network
import UIKit

/// Offline map regions: tiles fetched one by one from a tile server (OpenFreeMap),
/// the list of downloads, their state kept across restarts, and the files. The
/// iOS counterpart of MapsManager.kt and MapsDownloadWorker.kt, with the same
/// rules, the same files and the same statuses.
///
/// The limits that keep the app within the server's terms of use are enforced
/// here, in native code, whatever the web layer asks: `maxTiles` a region,
/// `maxBytes` a region, `maxParallel` requests at a time, a User-Agent that
/// names the app.
///
/// Tiles live in Application Support, excluded from backups, in `maps/`:
/// `<id>/<z>/<x>/<y>` is a ready region (plus `meta.json`), `_part_<id>/` the
/// download in progress. A resume skips the tiles already there. An update of a
/// ready id downloads into `_part_<id>/` and swaps it in only once complete, so
/// the old tiles stay readable. A zero-length tile file is an empty tile.
///
/// One download runs at a time, in the order of the requests. "Wi-Fi only"
/// means a network that is neither expensive (cellular, personal hotspot) nor
/// constrained (Low Data Mode).
///
/// In the background: where Android runs a WorkManager job, iOS gives the app
/// the time it allows after it leaves the screen (beginBackgroundTask), then a
/// processing task (BGTaskScheduler) resumes the download when the system
/// grants one; otherwise it resumes when the app comes back.
public final class MapsManager {
    public static let shared = MapsManager()
    /// Declared in the app's Info.plist (BGTaskSchedulerPermittedIdentifiers).
    public static let backgroundTaskIdentifier = "org.opendives.app.maps-download"

    static let maxTiles = 3000
    static let maxBytes: Int64 = 50 * 1024 * 1024
    static let maxParallel = 4
    static let repoURL = "https://github.com/remillc/opendives"
    private static let maxLatitude = 85.0511287798
    private static let partialMaxAge: TimeInterval = 7 * 24 * 3600
    private static let progressEventInterval: TimeInterval = 0.5
    private static let maxRetries = 2
    private static let stateFile = "maps-state.json"
    private static let meta = "meta.json"
    private static let partPrefix = "_part_"
    private static let oldPrefix = "_old_"

    static let queued = "queued"
    static let waitingWifi = "waiting-wifi"
    static let downloading = "downloading"
    static let paused = "paused"
    static let failed = "failed"
    static let ready = "ready"

    /// One download. `gen` changes when the request for the id is replaced, so a running download notices.
    struct Entry {
        let id: String
        let bbox: [Double] // west, south, east, north
        let maxZoom: Int
        let urlTemplate: String
        let version: String
        var allowCellular: Bool
        var title: String
        var status: String
        var tilesDone: Int
        var tilesTotal: Int
        var bytesReceived: Int64
        var error: String?
        var order: Int64
        var gen: Int64

        /// The MapDownload object of the JS contract.
        var event: [String: Any] {
            var o: [String: Any] = [
                "id": id, "status": status, "tilesDone": tilesDone,
                "tilesTotal": tilesTotal, "bytesReceived": bytesReceived,
            ]
            if let error { o["error"] = error }
            return o
        }

        var state: [String: Any] {
            var o = event
            o["bbox"] = bbox
            o["maxZoom"] = maxZoom
            o["urlTemplate"] = urlTemplate
            o["version"] = version
            o["allowCellular"] = allowCellular
            o["title"] = title
            o["order"] = order
            o["gen"] = gen
            return o
        }

        init(id: String, bbox: [Double], maxZoom: Int, urlTemplate: String, version: String,
             allowCellular: Bool, title: String, status: String, tilesDone: Int, tilesTotal: Int,
             bytesReceived: Int64, error: String?, order: Int64, gen: Int64) {
            self.id = id
            self.bbox = bbox
            self.maxZoom = maxZoom
            self.urlTemplate = urlTemplate
            self.version = version
            self.allowCellular = allowCellular
            self.title = title
            self.status = status
            self.tilesDone = tilesDone
            self.tilesTotal = tilesTotal
            self.bytesReceived = bytesReceived
            self.error = error
            self.order = order
            self.gen = gen
        }

        init?(state o: [String: Any]) {
            guard let id = o["id"] as? String,
                  let bbox = (o["bbox"] as? [NSNumber])?.map(\.doubleValue), bbox.count == 4,
                  let maxZoom = (o["maxZoom"] as? NSNumber)?.intValue,
                  let urlTemplate = o["urlTemplate"] as? String,
                  let status = o["status"] as? String,
                  let tilesTotal = (o["tilesTotal"] as? NSNumber)?.intValue
            else { return nil }
            let error = o["error"] as? String
            self.init(
                id: id, bbox: bbox, maxZoom: maxZoom, urlTemplate: urlTemplate,
                version: o["version"] as? String ?? "", allowCellular: o["allowCellular"] as? Bool ?? false,
                title: o["title"] as? String ?? "", status: status,
                tilesDone: (o["tilesDone"] as? NSNumber)?.intValue ?? 0, tilesTotal: tilesTotal,
                bytesReceived: (o["bytesReceived"] as? NSNumber)?.int64Value ?? 0,
                error: (error?.isEmpty ?? true) ? nil : error,
                order: (o["order"] as? NSNumber)?.int64Value ?? 0, gen: (o["gen"] as? NSNumber)?.int64Value ?? 0)
        }
    }

    /// Guards `entries`, the counters and `listener`.
    private let lock = NSRecursiveLock()
    private var loaded = false
    /// In the order of the requests (Android's LinkedHashMap).
    private var entries: [Entry] = []
    private var nextOrder: Int64 = 1
    private var nextGen: Int64 = 1
    private var lastProgressEvent = Date.distantPast

    /// Set by the plugin while it is alive: gets every status change and the progress.
    var listener: (([String: Any]) -> Void)? {
        get { lock.locked { _listener } }
        set { lock.locked { _listener = newValue } }
    }
    private var _listener: (([String: Any]) -> Void)?

    /// The scheduling: `runner`, `suspended`, the background time and task. Serial.
    private let control = DispatchQueue(label: "org.opendives.maps")
    private var runner: Runner?
    /// The system took the background time back: nothing starts until the app
    /// comes back or a processing task runs.
    private var suspended = false
    private var backgroundTime: UIBackgroundTaskIdentifier = .invalid
    private var askingBackgroundTime = false
    private var processingTask: BGProcessingTask?

    private let pathMonitor = NWPathMonitor()
    private var path: NWPath?
    private let pathKnown = DispatchSemaphore(value: 0)

    private let fm = FileManager.default
    private let base: URL = {
        let dir = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        return dir
    }()

    var dir: URL {
        let d = base.appendingPathComponent("maps", isDirectory: true)
        if !fm.fileExists(atPath: d.path) {
            try? fm.createDirectory(at: d, withIntermediateDirectories: true)
            excludeFromBackup(d)
        }
        return d
    }

    func readyDir(_ id: String) -> URL { dir.appendingPathComponent(id, isDirectory: true) }
    func partDir(_ id: String) -> URL { dir.appendingPathComponent(Self.partPrefix + id, isDirectory: true) }
    private func oldDir(_ id: String) -> URL { dir.appendingPathComponent(Self.oldPrefix + id, isDirectory: true) }
    private var stateURL: URL { base.appendingPathComponent(Self.stateFile) }

    /// `OpenDives/<version> (dive log app; <repository>)`: no personal data.
    public static var userAgent: String {
        let version = Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "unknown"
        return "OpenDives/\(version) (dive log app; \(repoURL))"
    }

    private func excludeFromBackup(_ url: URL) {
        var values = URLResourceValues()
        values.isExcludedFromBackup = true
        var u = url
        try? u.setResourceValues(values)
    }

    // MARK: - Tiles (Web Mercator, "slippy map" numbering)

    /// A block of tiles of one zoom: x in [x0, x1], y in [y0, y1].
    struct TileRange {
        let z: Int, x0: Int, x1: Int, y0: Int, y1: Int
        var count: Int { (x1 - x0 + 1) * (y1 - y0 + 1) }
    }

    private static func tileX(_ lon: Double, _ n: Int) -> Int {
        min(max(Int(floor((lon + 180.0) / 360.0 * Double(n))), 0), n - 1)
    }

    private static func tileY(_ lat: Double, _ n: Int) -> Int {
        let r = min(max(lat, -maxLatitude), maxLatitude) * .pi / 180
        let y = Int(floor((1.0 - log(tan(r) + 1.0 / cos(r)) / .pi) / 2.0 * Double(n)))
        return min(max(y, 0), n - 1)
    }

    /// The tile blocks that cover [west, south, east, north] at zooms 0...maxZoom.
    /// West greater than east means the rectangle crosses the antimeridian: two
    /// blocks per zoom (one when they meet, as at low zooms, so no tile is counted twice).
    static func tileRanges(_ bbox: [Double], _ maxZoom: Int) -> [TileRange] {
        var out: [TileRange] = []
        for z in 0...maxZoom {
            let n = 1 << z
            let xw = tileX(bbox[0], n), xe = tileX(bbox[2], n)
            let yn = tileY(bbox[3], n), ys = tileY(bbox[1], n)
            if bbox[0] <= bbox[2] {
                out.append(TileRange(z: z, x0: xw, x1: xe, y0: yn, y1: ys))
            } else if xw <= xe + 1 {
                out.append(TileRange(z: z, x0: 0, x1: n - 1, y0: yn, y1: ys))
            } else {
                out.append(TileRange(z: z, x0: xw, x1: n - 1, y0: yn, y1: ys))
                out.append(TileRange(z: z, x0: 0, x1: xe, y0: yn, y1: ys))
            }
        }
        return out
    }

    static func countTiles(_ bbox: [Double], _ maxZoom: Int) -> Int {
        tileRanges(bbox, maxZoom).reduce(0) { $0 + $1.count }
    }

    static func tileURL(_ template: String, _ z: Int, _ x: Int, _ y: Int) -> URL? {
        URL(string: template.replacingOccurrences(of: "{z}", with: String(z))
            .replacingOccurrences(of: "{x}", with: String(x))
            .replacingOccurrences(of: "{y}", with: String(y)))
    }

    static func tileFile(_ root: URL, _ z: Int, _ x: Int, _ y: Int) -> URL {
        root.appendingPathComponent("\(z)/\(x)/\(y)")
    }

    /// Bytes of a ready tile; nil when the region or the tile is absent, empty for an empty tile.
    func readTile(_ id: String, _ z: Int, _ x: Int, _ y: Int) throws -> Data? {
        let f = Self.tileFile(readyDir(id), z, x, y)
        var isDir: ObjCBool = false
        guard fm.fileExists(atPath: f.path, isDirectory: &isDir), !isDir.boolValue else { return nil }
        return try Data(contentsOf: f)
    }

    /// Number and total size of the finished tile files of a directory (temporary files are ignored).
    func scan(_ root: URL) -> (count: Int, bytes: Int64) {
        var count = 0
        var bytes: Int64 = 0
        let keys: [URLResourceKey] = [.isDirectoryKey, .isRegularFileKey, .fileSizeKey]
        func children(_ u: URL) -> [URL] {
            (try? fm.contentsOfDirectory(at: u, includingPropertiesForKeys: keys)) ?? []
        }
        func isDir(_ u: URL) -> Bool { (try? u.resourceValues(forKeys: [.isDirectoryKey]))?.isDirectory ?? false }
        for zDir in children(root) where isDir(zDir) {
            for xDir in children(zDir) where isDir(xDir) {
                for f in children(xDir) {
                    let name = f.lastPathComponent
                    guard !name.isEmpty, name.allSatisfy(\.isNumber),
                          let v = try? f.resourceValues(forKeys: [.isRegularFileKey, .fileSizeKey]),
                          v.isRegularFile == true
                    else { continue }
                    count += 1
                    bytes += Int64(v.fileSize ?? 0)
                }
            }
        }
        return (count, bytes)
    }

    // MARK: - State

    /// Loads the state, tidies the files and starts the first download of the
    /// queue. Once; from the plugin, and from a processing task when iOS starts
    /// the app in the background.
    public func load() {
        let first: Bool = lock.locked {
            if loaded { return false }
            loaded = true
            loadLocked()
            return true
        }
        guard first else { return }
        // The first network status, so that a download does not show "waiting for Wi-Fi" for an instant.
        _ = pathKnown.wait(timeout: .now() + 1)
        schedule()
    }

    /// Under `lock`.
    private func loadLocked() {
        pathMonitor.pathUpdateHandler = { [weak self] path in
            guard let self else { return }
            let first = self.lock.locked { () -> Bool in
                let first = self.path == nil
                self.path = path
                return first
            }
            if first { self.pathKnown.signal() }
            self.schedule()
        }
        pathMonitor.start(queue: DispatchQueue(label: "org.opendives.maps.path"))

        let center = NotificationCenter.default
        center.addObserver(forName: UIApplication.willEnterForegroundNotification, object: nil, queue: nil) { [weak self] _ in
            guard let self else { return }
            self.control.async {
                self.suspended = false
                self.scheduleNow()
            }
        }
        center.addObserver(forName: UIApplication.didEnterBackgroundNotification, object: nil, queue: nil) { [weak self] _ in
            guard let self else { return }
            // Something is left to download: ask iOS for a processing task, in case the time runs out.
            if self.head() != nil { self.submitProcessingTask() }
        }

        let items = (try? fm.contentsOfDirectory(at: dir, includingPropertiesForKeys: [.isDirectoryKey, .contentModificationDateKey])) ?? []
        func isDir(_ u: URL) -> Bool { (try? u.resourceValues(forKeys: [.isDirectoryKey]))?.isDirectory ?? false }

        // A swap interrupted between its two moves: the old tiles come back.
        for f in items where isDir(f) && f.lastPathComponent.hasPrefix(Self.oldPrefix) {
            let ready = readyDir(String(f.lastPathComponent.dropFirst(Self.oldPrefix.count)))
            if fm.fileExists(atPath: ready.path) { try? fm.removeItem(at: f) } else { try? fm.moveItem(at: f, to: ready) }
        }

        if let data = try? Data(contentsOf: stateURL),
           let array = try? JSONSerialization.jsonObject(with: data) as? [[String: Any]] {
            for o in array {
                // A damaged entry is dropped.
                guard let e = Entry(state: o) else { continue }
                entries.removeAll { $0.id == e.id }
                entries.append(e)
                nextOrder = max(nextOrder, e.order + 1)
                nextGen = max(nextGen, e.gen + 1)
            }
        }

        // Partial downloads abandoned for more than 7 days go; their entries with them.
        let limit = Date().addingTimeInterval(-Self.partialMaxAge)
        for f in currentItems() where isDir(f) && f.lastPathComponent.hasPrefix(Self.partPrefix) {
            let modified = (try? f.resourceValues(forKeys: [.contentModificationDateKey]))?.contentModificationDate ?? .distantPast
            if modified < limit {
                try? fm.removeItem(at: f)
                let id = String(f.lastPathComponent.dropFirst(Self.partPrefix.count))
                if entry(id)?.status != Self.ready { entries.removeAll { $0.id == id } }
            }
        }
        // Part directories nobody asks for.
        for f in currentItems() where isDir(f) && f.lastPathComponent.hasPrefix(Self.partPrefix) {
            let status = entry(String(f.lastPathComponent.dropFirst(Self.partPrefix.count)))?.status
            if status == nil || status == Self.ready { try? fm.removeItem(at: f) }
        }
        // Ready regions on disk are the truth for the ready entries.
        for f in currentItems() where isDir(f) && !f.lastPathComponent.hasPrefix("_") {
            if entry(f.lastPathComponent) == nil, let e = readyEntry(f.lastPathComponent) { entries.append(e) }
        }
        var kept: [Entry] = []
        for var e in entries {
            switch e.status {
            case Self.ready:
                if !fm.fileExists(atPath: readyDir(e.id).appendingPathComponent(Self.meta).path) { continue }
            // The app died during the download (or while it waited): it goes back in the queue.
            case Self.downloading, Self.waitingWifi:
                e.status = Self.queued
            default:
                break
            }
            if [Self.queued, Self.paused, Self.failed].contains(e.status) { rescan(&e) }
            kept.append(e)
        }
        entries = kept
        save()
    }

    private func currentItems() -> [URL] {
        (try? fm.contentsOfDirectory(at: dir, includingPropertiesForKeys: [.isDirectoryKey, .contentModificationDateKey])) ?? []
    }

    private func entry(_ id: String) -> Entry? { entries.first { $0.id == id } }

    private func rescan(_ e: inout Entry) {
        let (count, bytes) = scan(partDir(e.id))
        e.tilesDone = count
        e.bytesReceived = bytes
    }

    /// The entry of a ready region, rebuilt from its meta file; nil when it has none.
    private func readyEntry(_ id: String) -> Entry? {
        guard let data = try? Data(contentsOf: readyDir(id).appendingPathComponent(Self.meta)),
              let o = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              var e = Entry(state: o)
        else { return nil }
        e.status = Self.ready
        e.error = nil
        return e
    }

    private func save() {
        do {
            let data = try JSONSerialization.data(withJSONObject: entries.map(\.state))
            try data.write(to: stateURL, options: .atomic)
            excludeFromBackup(stateURL)
        } catch {
            NSLog("OpenDives: cannot save the maps state: \(error.localizedDescription)")
        }
    }

    // MARK: - Requests from the plugin

    func downloads() -> [Entry] { lock.locked { entries } }

    static let idPattern = try! NSRegularExpression(pattern: "^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$")

    /// Whether a region id is acceptable: letters, digits, dot, dash, underscore (it names a directory).
    static func isValidId(_ id: String) -> Bool {
        !id.contains("..") && idPattern.firstMatch(in: id, range: NSRange(id.startIndex..., in: id)) != nil
    }

    /// Validates a request; the error code to reject with, or nil when it is
    /// acceptable. BAD_ARGUMENT for a malformed request, TOO_MANY_TILES above maxTiles.
    static func check(_ bbox: [Double]?, _ maxZoom: Int, _ urlTemplate: String?) -> String? {
        guard let b = bbox, b.count == 4, b.allSatisfy(\.isFinite) else { return "BAD_ARGUMENT" }
        if b[0] < -180 || b[0] > 180 || b[2] < -180 || b[2] > 180 || b[1] < -90 || b[3] > 90 || b[1] > b[3] { return "BAD_ARGUMENT" }
        if maxZoom != 12 && maxZoom != 14 { return "BAD_ARGUMENT" }
        guard let t = urlTemplate, t.hasPrefix("https://"), t.contains("{z}"), t.contains("{x}"), t.contains("{y}") else { return "BAD_ARGUMENT" }
        if countTiles(b, maxZoom) > maxTiles { return "TOO_MANY_TILES" }
        return nil
    }

    /// Queues a region (already checked). Nothing happens if the same region is already ready.
    func start(id: String, bbox: [Double], maxZoom: Int, urlTemplate: String, version: String, allowCellular: Bool, title: String) {
        let total = Self.countTiles(bbox, maxZoom)
        let changed: Entry? = lock.locked {
            let old = entry(id)
            let same = old.map { $0.bbox == bbox && $0.maxZoom == maxZoom && $0.urlTemplate == urlTemplate && $0.version == version } ?? false
            if same && old?.status == Self.ready { return nil } // already up to date
            // The same request again (a restart of the screen): the tiles already there are kept.
            if !same { try? fm.removeItem(at: partDir(id)) }
            var e = Entry(id: id, bbox: bbox, maxZoom: maxZoom, urlTemplate: urlTemplate, version: version,
                          allowCellular: allowCellular, title: title, status: Self.queued, tilesDone: 0,
                          tilesTotal: total, bytesReceived: 0, error: nil, order: nextOrder, gen: nextGen)
            nextOrder += 1
            nextGen += 1
            if same { rescan(&e) }
            entries.removeAll { $0.id == id } // goes to the end of the queue
            entries.append(e)
            save()
            return e
        }
        guard let changed else { return }
        emit(changed)
        schedule()
    }

    func pause(_ id: String) {
        change(id) { e in
            if e.status != Self.ready && e.status != Self.failed { e.status = Self.paused }
        }
    }

    func resume(_ id: String, allowCellular: Bool) {
        change(id) { e in
            if e.status != Self.ready {
                e.allowCellular = allowCellular
                e.status = Self.queued
                e.error = nil
                e.order = nextOrder
                nextOrder += 1
            }
        }
    }

    func cancel(_ id: String) {
        var found = false
        let restored: Entry? = lock.locked {
            guard let e = entry(id), e.status != Self.ready else { return nil }
            found = true
            entries.removeAll { $0.id == id }
            try? fm.removeItem(at: partDir(id))
            // The old tiles of an update stay: the region keeps its place.
            let r = readyEntry(id)
            if let r { entries.append(r) }
            save()
            return r
        }
        guard found else { return }
        if let restored { emit(restored) }
        schedule()
    }

    func delete(_ id: String) {
        lock.locked {
            entries.removeAll { $0.id == id }
            try? fm.removeItem(at: partDir(id))
            try? fm.removeItem(at: readyDir(id))
            save()
        }
        schedule()
    }

    private func change(_ id: String, _ block: (inout Entry) -> Void) {
        let changed: Entry? = lock.locked {
            guard let i = entries.firstIndex(where: { $0.id == id }) else { return nil }
            block(&entries[i])
            if entries[i].status == Self.paused || entries[i].status == Self.queued { rescan(&entries[i]) }
            save()
            return entries[i]
        }
        guard let changed else { return }
        emit(changed)
        schedule()
    }

    /// Ready regions: id, size in bytes, version, maxZoom.
    func files() -> [(id: String, sizeBytes: Int64, version: String, maxZoom: Int)] {
        currentItems()
            .filter { (try? $0.resourceValues(forKeys: [.isDirectoryKey]))?.isDirectory == true && !$0.lastPathComponent.hasPrefix("_") }
            .compactMap { readyEntry($0.lastPathComponent) }
            .map { ($0.id, $0.bytesReceived, $0.version, $0.maxZoom) }
    }

    /// The space left for data the user asked for, and the size of the volume.
    func freeSpace() -> (free: Int64, total: Int64) {
        let v = try? base.resourceValues(forKeys: [.volumeAvailableCapacityForImportantUsageKey, .volumeTotalCapacityKey])
        return (v?.volumeAvailableCapacityForImportantUsage ?? 0, Int64(v?.volumeTotalCapacity ?? 0))
    }

    // MARK: - Used by the download

    /// The download to run now: the first in the queue.
    func head() -> Entry? {
        lock.locked {
            entries.filter { [Self.queued, Self.waitingWifi, Self.downloading].contains($0.status) }.min { $0.order < $1.order }
        }
    }

    /// Whether the download `gen` of `id` is still the one that should run.
    func isRunning(_ id: String, _ gen: Int64) -> Bool {
        lock.locked { entry(id).map { $0.gen == gen && $0.status == Self.downloading } ?? false }
    }

    /// Changes the entry if it is still the same request; false when it was replaced or removed.
    @discardableResult
    func update(_ id: String, _ gen: Int64, _ block: (inout Entry) -> Void) -> Bool {
        let changed: Entry? = lock.locked {
            guard let i = entries.firstIndex(where: { $0.id == id }), entries[i].gen == gen else { return nil }
            block(&entries[i])
            save()
            return entries[i]
        }
        guard let changed else { return false }
        emit(changed)
        return true
    }

    /// Progress in memory only (the part directory is the truth after a restart); an event at most every 500 ms.
    func progress(_ id: String, _ gen: Int64, _ tilesDone: Int, _ bytes: Int64) {
        let event: [String: Any]? = lock.locked {
            guard let i = entries.firstIndex(where: { $0.id == id }), entries[i].gen == gen else { return nil }
            entries[i].tilesDone = tilesDone
            entries[i].bytesReceived = bytes
            let now = Date()
            if now.timeIntervalSince(lastProgressEvent) < Self.progressEventInterval { return nil }
            lastProgressEvent = now
            return entries[i].event
        }
        guard let event else { return }
        // The age of a part directory is the time of its last progress.
        try? fm.setAttributes([.modificationDate: Date()], ofItemAtPath: partDir(id).path)
        listener?(event)
    }

    /// A complete region: the part directory replaces the old tiles.
    func finish(_ id: String, _ gen: Int64) -> Bool {
        let swapped: Bool = lock.locked {
            guard let i = entries.firstIndex(where: { $0.id == id }), entries[i].gen == gen else { return false }
            let part = partDir(id)
            let (count, bytes) = scan(part)
            entries[i].tilesDone = count
            entries[i].bytesReceived = bytes
            entries[i].status = Self.ready
            entries[i].error = nil
            do {
                let data = try JSONSerialization.data(withJSONObject: entries[i].state)
                try data.write(to: part.appendingPathComponent(Self.meta))
            } catch {
                NSLog("OpenDives: cannot write the region's meta file: \(error.localizedDescription)")
                return false
            }
            let ready = readyDir(id)
            let old = oldDir(id)
            try? fm.removeItem(at: old)
            if fm.fileExists(atPath: ready.path) {
                do { try fm.moveItem(at: ready, to: old) } catch { return false }
            }
            do {
                try fm.moveItem(at: part, to: ready)
            } catch {
                if fm.fileExists(atPath: old.path) { try? fm.moveItem(at: old, to: ready) }
                return false
            }
            try? fm.removeItem(at: old)
            return true
        }
        return swapped && update(id, gen) { _ in }
    }

    private func emit(_ e: Entry) {
        listener?(e.event)
    }

    func isUnmetered() -> Bool {
        lock.locked { path.map { $0.status == .satisfied && !$0.isExpensive && !$0.isConstrained } ?? false }
    }

    func isConnected() -> Bool {
        lock.locked { path?.status == .satisfied }
    }

    /// Whether the network now lets this download run.
    func networkAllows(_ e: Entry) -> Bool { e.allowCellular ? isConnected() : isUnmetered() }

    // MARK: - Scheduling

    /// (Re)plans the download of the first region of the queue, with the network it needs.
    func schedule() {
        control.async { self.scheduleNow() }
    }

    /// Control queue only.
    private func scheduleNow() {
        let head = self.head()
        // The download in progress goes on when the queue changes behind it.
        if let r = runner, let head, r.entry.id == head.id, r.entry.gen == head.gen { return }
        runner?.stop()
        runner = nil
        guard let head else {
            endBackgroundTime()
            completeProcessingTask(success: true)
            return
        }
        // Waiting for Wi-Fi is a status of its own, set here and cleared when the network allows.
        let allows = networkAllows(head)
        let wanted = allows ? (head.status == Self.waitingWifi ? Self.queued : head.status) : Self.waitingWifi
        if wanted != head.status { update(head.id, head.gen) { $0.status = wanted } }
        guard allows, !suspended else {
            endBackgroundTime()
            if !allows { completeProcessingTask(success: true) }
            return
        }
        guard update(head.id, head.gen, { $0.status = Self.downloading; $0.error = nil }) else { return }
        var running = head
        running.status = Self.downloading
        let r = Runner(manager: self, entry: running)
        runner = r
        beginBackgroundTime()
        Thread.detachNewThread { [weak self] in
            r.run()
            self?.control.async {
                guard let self else { return }
                if self.runner === r { self.runner = nil }
                // The next region of the queue, if any (it may need another network).
                self.scheduleNow()
            }
        }
    }

    /// Control queue only.
    private func beginBackgroundTime() {
        guard backgroundTime == .invalid, !askingBackgroundTime else { return }
        askingBackgroundTime = true
        DispatchQueue.main.async {
            var id = UIBackgroundTaskIdentifier.invalid
            id = UIApplication.shared.beginBackgroundTask(withName: "OpenDives offline map") { [weak self] in
                // iOS takes the time back: the download stops cleanly and waits for a processing task or the app.
                self?.control.sync {
                    guard let self else { return }
                    if self.backgroundTime == id { self.backgroundTime = .invalid }
                    self.suspendNow()
                }
                UIApplication.shared.endBackgroundTask(id)
            }
            self.control.async {
                self.askingBackgroundTime = false
                if self.backgroundTime == .invalid && self.runner != nil {
                    self.backgroundTime = id
                } else {
                    DispatchQueue.main.async { UIApplication.shared.endBackgroundTask(id) }
                }
            }
        }
    }

    /// Control queue only.
    private func endBackgroundTime() {
        let id = backgroundTime
        guard id != .invalid else { return }
        backgroundTime = .invalid
        DispatchQueue.main.async { UIApplication.shared.endBackgroundTask(id) }
    }

    /// Control queue only: the system wants the app to stop working.
    private func suspendNow() {
        suspended = true
        runner?.stop()
        if head() != nil { submitProcessingTask() }
        endBackgroundTime()
        completeProcessingTask(success: false)
    }

    /// Registers the processing task that resumes a download in the background.
    /// Call it from application(_:didFinishLaunchingWithOptions:).
    public static func registerBackgroundTask() {
        BGTaskScheduler.shared.register(forTaskWithIdentifier: backgroundTaskIdentifier, using: nil) { task in
            guard let task = task as? BGProcessingTask else {
                task.setTaskCompleted(success: true)
                return
            }
            shared.runProcessingTask(task)
        }
    }

    private func runProcessingTask(_ task: BGProcessingTask) {
        DispatchQueue.global(qos: .utility).async {
            self.load()
            self.control.async {
                self.completeProcessingTask(success: true)
                self.processingTask = task
                self.suspended = false
                task.expirationHandler = { [weak self] in
                    self?.control.async { self?.suspendNow() }
                }
                self.scheduleNow()
            }
        }
    }

    /// Control queue only.
    private func completeProcessingTask(success: Bool) {
        guard let task = processingTask else { return }
        processingTask = nil
        task.setTaskCompleted(success: success)
    }

    private func submitProcessingTask() {
        let request = BGProcessingTaskRequest(identifier: Self.backgroundTaskIdentifier)
        request.requiresNetworkConnectivity = true
        request.requiresExternalPower = false
        do {
            try BGTaskScheduler.shared.submit(request)
        } catch {
            // The simulator, or background work turned off: the download resumes when the app comes back.
            NSLog("OpenDives: no background task for the map download: \(error.localizedDescription)")
        }
    }
}

/// Downloads one region tile by tile, with at most MapsManager.maxParallel
/// requests at a time, skipping the tiles already on disk. It stops at
/// MapsManager.maxBytes (error "limit", the tiles are removed).
private final class Runner {
    private enum Outcome {
        case done
        case stopped
        case failed(String)
    }

    private enum FetchError: Error {
        case server(retry: Bool)
        case network
    }

    let entry: MapsManager.Entry
    private unowned let manager: MapsManager
    private let session: URLSession
    private let lock = NSLock()
    private var stopRequested = false
    private var tasks: [Int: URLSessionTask] = [:]

    init(manager: MapsManager, entry: MapsManager.Entry) {
        self.manager = manager
        self.entry = entry
        let config = URLSessionConfiguration.ephemeral
        config.timeoutIntervalForRequest = 30
        config.httpMaximumConnectionsPerHost = MapsManager.maxParallel
        config.requestCachePolicy = .reloadIgnoringLocalCacheData
        config.urlCache = nil
        // "Wi-Fi only": neither an expensive nor a constrained network.
        config.allowsExpensiveNetworkAccess = entry.allowCellular
        config.allowsConstrainedNetworkAccess = entry.allowCellular
        session = URLSession(configuration: config)
    }

    private var isStopped: Bool { lock.locked { stopRequested } }

    /// Stops the download: the requests in flight are cancelled.
    func stop() {
        let running: [URLSessionTask] = lock.locked {
            stopRequested = true
            return Array(tasks.values)
        }
        running.forEach { $0.cancel() }
    }

    /// The download, then the status it leaves.
    func run() {
        let m = manager
        let e = entry
        let outcome = download()
        session.finishTasksAndInvalidate()
        switch outcome {
        case .done:
            break
        case .stopped:
            // Stopped by the system (the time ran out) while still wanted: it waits and resumes.
            if m.isRunning(e.id, e.gen) {
                let state = m.networkAllows(e) ? MapsManager.queued : MapsManager.waitingWifi
                m.update(e.id, e.gen) { $0.status = state }
            }
        case .failed(let error):
            if error == "network" && !m.networkAllows(e) {
                // The network allowed by the diver went away: not an error, it resumes when it is back.
                m.update(e.id, e.gen) { $0.status = MapsManager.waitingWifi }
            } else {
                m.update(e.id, e.gen) {
                    $0.status = MapsManager.failed
                    $0.error = error
                }
            }
        }
    }

    private func download() -> Outcome {
        let m = manager
        let e = entry
        let fm = FileManager.default
        let part = m.partDir(e.id)
        do {
            try fm.createDirectory(at: part, withIntermediateDirectories: true)
        } catch {
            return .failed(Self.isSpaceError(error) ? "space" : "network")
        }
        if m.freeSpace().free < MapsManager.maxBytes { return .failed("space") }

        let ranges = MapsManager.tileRanges(e.bbox, e.maxZoom)
        let state = NSLock()
        var rangeIndex = 0, nextX = ranges.first?.x0 ?? 0, nextY = ranges.first?.y0 ?? 0
        var done = 0
        var received = m.scan(part).bytes
        var failure: String?
        var stopped = false

        /// The next tile, lowest zoom first.
        func nextTile() -> (Int, Int, Int)? {
            state.locked {
                guard rangeIndex < ranges.count else { return nil }
                let r = ranges[rangeIndex]
                let tile = (r.z, nextX, nextY)
                nextY += 1
                if nextY > r.y1 {
                    nextY = r.y0
                    nextX += 1
                    if nextX > r.x1 {
                        rangeIndex += 1
                        if rangeIndex < ranges.count {
                            nextX = ranges[rangeIndex].x0
                            nextY = ranges[rangeIndex].y0
                        }
                    }
                }
                return tile
            }
        }

        func fail(_ error: String) { state.locked { if failure == nil { failure = error } } }

        // A worker: takes tiles until none is left, or until something stops the download.
        func work() {
            while state.locked({ failure == nil }) {
                if isStopped || !m.isRunning(e.id, e.gen) {
                    state.locked { stopped = true }
                    return
                }
                guard let (z, x, y) = nextTile() else { return }
                let file = MapsManager.tileFile(part, z, x, y)
                if !fm.fileExists(atPath: file.path) {
                    guard let url = MapsManager.tileURL(e.urlTemplate, z, x, y) else { return fail("server") }
                    let data: Data
                    do {
                        guard let d = try fetch(url) else {
                            state.locked { stopped = true }
                            return
                        }
                        data = d
                    } catch FetchError.server {
                        return fail("server")
                    } catch {
                        return fail("network")
                    }
                    do {
                        let dir = file.deletingLastPathComponent()
                        try fm.createDirectory(at: dir, withIntermediateDirectories: true)
                        // A name of its own: a download replaced a moment ago may still write here.
                        let tmp = dir.appendingPathComponent("\(y).\(UUID().uuidString).tmp")
                        try data.write(to: tmp)
                        do {
                            try fm.moveItem(at: tmp, to: file)
                        } catch where fm.fileExists(atPath: file.path) {
                            try? fm.removeItem(at: tmp)
                        }
                    } catch {
                        return fail(Self.isSpaceError(error) ? "space" : "network")
                    }
                    let total = state.locked { () -> Int64 in
                        received += Int64(data.count)
                        return received
                    }
                    if total >= MapsManager.maxBytes { return fail("limit") }
                }
                let (n, bytes) = state.locked { () -> (Int, Int64) in
                    done += 1
                    return (done, received)
                }
                m.progress(e.id, e.gen, n, bytes)
            }
        }

        let group = DispatchGroup()
        for _ in 0..<MapsManager.maxParallel {
            group.enter()
            Thread.detachNewThread {
                work()
                group.leave()
            }
        }
        group.wait()

        if let failure {
            // Over the limit: nothing of the region is kept.
            if failure == "limit" { try? fm.removeItem(at: part) }
            return .failed(failure)
        }
        if stopped || isStopped { return .stopped }
        if done < e.tilesTotal { return .failed("network") }
        return m.finish(e.id, e.gen) ? .done : .stopped
    }

    /// One tile: its bytes, empty for a tile the server does not have (204,
    /// 404); nil when the download was stopped meanwhile. Retries a network
    /// error or a 429/5xx twice, then fails.
    private func fetch(_ url: URL) throws -> Data? {
        var attempt = 0
        while true {
            var request = URLRequest(url: url)
            request.setValue(MapsManager.userAgent, forHTTPHeaderField: "User-Agent")
            let done = DispatchSemaphore(value: 0)
            var result: (Data?, URLResponse?, Error?) = (nil, nil, nil)
            let task = session.dataTask(with: request) { data, response, error in
                result = (data, response, error)
                done.signal()
            }
            let started: Bool = lock.locked {
                if stopRequested { return false }
                tasks[task.taskIdentifier] = task
                return true
            }
            if !started { return nil }
            task.resume()
            done.wait()
            lock.locked { _ = tasks.removeValue(forKey: task.taskIdentifier) }

            let failure: FetchError
            if let http = result.1 as? HTTPURLResponse {
                if http.statusCode == 200 { return result.0 ?? Data() }
                if http.statusCode == 204 || http.statusCode == 404 { return Data() }
                failure = .server(retry: http.statusCode == 429 || http.statusCode >= 500)
            } else if isStopped || (result.2 as? URLError)?.code == .cancelled {
                return nil
            } else {
                failure = .network
            }
            if case .server(retry: false) = failure { throw failure }
            if attempt >= 2 { throw failure }
            attempt += 1
            // A pause of one second per attempt, cut short by a stop.
            for _ in 0..<(10 * attempt) {
                if isStopped { return nil }
                Thread.sleep(forTimeInterval: 0.1)
            }
        }
    }

    private static func isSpaceError(_ error: Error) -> Bool {
        let ns = error as NSError
        if ns.domain == NSCocoaErrorDomain && ns.code == NSFileWriteOutOfSpaceError { return true }
        if ns.domain == NSPOSIXErrorDomain && ns.code == Int(ENOSPC) { return true }
        if let underlying = ns.userInfo[NSUnderlyingErrorKey] as? Error { return isSpaceError(underlying) }
        return false
    }
}

private extension NSLocking {
    func locked<T>(_ body: () throws -> T) rethrows -> T {
        lock()
        defer { unlock() }
        return try body()
    }
}
