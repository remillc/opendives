// SPDX-License-Identifier: GPL-2.0
import Capacitor
import Foundation
import Network
import StoreKit
import UIKit

/// A call to reject with a given code (the JavaScript branches on the codes).
struct Failure: Error {
    let code: String
    let message: String

    init(_ code: String, _ message: String? = nil) {
        self.code = code
        self.message = message ?? code
    }
}

/// The iOS side of the plugin whose contract is OpenDives' core-api.js, under
/// the same name as the Android one.
@objc(OpenDivesCorePlugin)
public class OpenDivesCorePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "OpenDivesCorePlugin"
    public let jsName = "OpenDivesCore"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "importSample", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "listDives", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getDive", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "plannerSetup", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "planDive", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getPrefs", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setPrefs", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "cylinderTypes", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "configureCloud", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "probeCloud", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "listCloudDives", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "pendingChanges", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "signOut", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "deleteAccount", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "signIn", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "createAccount", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "gitCheck", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "gitConfig", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "gitConnect", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "resendCode", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "verifyPin", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "divelogsDownload", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "divelogsCheck", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stageImport", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "importCount", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "discardImport", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "createLog", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "editDive", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getTrip", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "tripAction", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "undo", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "syncChanges", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "listLoadedDives", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "saveLocal", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "toolQuery", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "siteQuery", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "filterQuery", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "createDive", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "placesSearch", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "networkStatus", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "cancelConflictResolution", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "diveComputers", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "diveComputerAction", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "listPlans", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "savePlan", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "deleteDive", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "renumberDives", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "importDives", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "deviceLog", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "filterPresets", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "syncConflicts", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "resolveConflicts", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "statsQuery", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "siteAction", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "bluetoothStatus", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "requestBluetoothPermission", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "enableBluetooth", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "openAppSettings", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "qrScan", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "keepScreenAwake", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "installSource", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "requestReview", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "openStorePage", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "contentShown", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "readSharedFile", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "startBluetoothScan", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stopBluetoothScan", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "bluetoothModels", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "downloadDives", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "downloadPartial", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "cancelDownload", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "writeShareFile", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "grantShareFile", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "exportDives", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "htmlToPdf", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "mapsFreeSpace", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "mapsTilesStart", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "mapsDownloadPause", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "mapsDownloadResume", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "mapsDownloadCancel", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "mapsDownloads", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "mapsFiles", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "mapsDelete", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "mapsReadTile", returnType: CAPPluginReturnPromise),
    ]

    /// The core is not reentrant: only this queue calls it.
    private let coreQueue = DispatchQueue(label: "org.opendives.core")
    /// Network only (probeCloud, gitCheck): runs while the core queue loads the log.
    private let networkQueue = DispatchQueue(label: "org.opendives.core.network")
    /// Released once the core, the certificates and the regions are set up.
    private let setupDone = DispatchGroup()

    private let resources = Bundle(for: OpenDivesCorePlugin.self)

    private let home: URL = {
        let dir = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        return dir
    }()

    private let cacheDir: URL = {
        let dir = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0]
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        return dir
    }()

    private var repoDir: URL { home.appendingPathComponent("carnet") }
    private var repo: String { repoDir.path + "[main]" }

    private let credentials = CredentialStore()
    private let gitStore = GitRemoteStore()

    /// An account being created or signed in to whose logbook does not exist yet:
    /// in memory only, stored once its logbook is created. Core queue only.
    private var pendingAccount: (email: String, password: String)?

    private let bluetoothState = BluetoothState()
    private let stateLock = NSLock()
    private var scan: ODBluetoothScan?
    /// Main thread only.
    private var pdfRenderers: [HtmlPdfRenderer] = []

    private let importPrefix = "import-"

    override public func load() {
        MapsManager.shared.listener = { [weak self] event in self?.notifyListeners("mapsDownload", data: event) }
        mapsIo.async { MapsManager.shared.load() }
        DispatchQueue.main.async { [weak self] in
            LaunchCover.show(over: self?.bridge?.viewController?.view, webView: self?.webView,
                             viewProvider: { [weak self] in self?.bridge?.viewController?.view })
        }
        setupDone.enter()
        coreQueue.async { [self] in
            defer { setupDone.leave() }
            do {
                try OpenDivesNative.initialize(withHome: home.path)
            } catch {
                CAPLog.print("OpenDives: cannot start the core: \(error.localizedDescription)")
            }
            // The messages of the cloud log's git work, while it syncs.
            OpenDivesNative.setSyncProgress { [weak self] message in
                self?.notifyListeners("syncProgress", data: ["message": message])
            }
            // iOS cannot export its trust store: the Mozilla bundle ships with the plugin.
            if let certificates = resources.path(forResource: "cacert", ofType: "pem") {
                if !OpenDivesNative.setCaFile(certificates) {
                    CAPLog.print("OpenDives: certificate authorities rejected by libgit2")
                }
            } else {
                CAPLog.print("OpenDives: cacert.pem is missing from the plugin's resources")
            }
            if let regions = resources.path(forResource: "regions", ofType: "txt") {
                OpenDivesNative.setRegionsFile(regions)
            }
            if let root = resources.resourcePath {
                OpenDivesNative.setXsltDir(root + "/xslt")
            }
        }
    }

    // MARK: - Helpers

    private func reject(_ call: CAPPluginCall, _ error: Error) {
        if let failure = error as? Failure {
            call.reject(failure.message, failure.code)
        } else {
            // The core's error text, "CODE: details"; the JavaScript reads the code in it.
            call.reject(error.localizedDescription, "CORE_ERROR")
        }
    }

    /// `afterSetup` false: the call neither reaches the network nor needs the
    /// regions (the core's own set-up is always done first on this queue).
    private func onCoreThread(_ call: CAPPluginCall, afterSetup: Bool = true, _ block: @escaping () throws -> Void) {
        coreQueue.async { [self] in
            if afterSetup { setupDone.wait() }
            do {
                try block()
            } catch {
                reject(call, error)
            }
        }
    }

    private func onNetworkThread(_ call: CAPPluginCall, _ block: @escaping () throws -> Void) {
        networkQueue.async { [self] in
            setupDone.wait()
            do {
                try block()
            } catch {
                reject(call, error)
            }
        }
    }

    private func jsonText(_ object: JSObject) -> String? {
        guard let data = try? JSONSerialization.data(withJSONObject: object) else { return nil }
        return String(data: data, encoding: .utf8)
    }

    private func parseObject(_ json: String) -> [String: Any] {
        guard let any = try? JSONSerialization.jsonObject(with: Data(json.utf8)),
              let object = any as? [String: Any]
        else { return [:] }
        return object
    }

    private func resolveObject(_ call: CAPPluginCall, _ json: String) {
        call.resolve(JSTypes.coerceDictionaryToJSObject(parseObject(json)) ?? [:])
    }

    private func numbers(_ values: [Int]) -> [NSNumber] {
        values.map { NSNumber(value: $0) }
    }

    private func intList(_ call: CAPPluginCall, _ key: String) -> [Int]? {
        guard let array = call.options[key] as? [Any] else { return nil }
        return array.compactMap { ($0 as? NSNumber)?.intValue }
    }

    /// A site uuid is an unsigned 32-bit number: read any number.
    private func int64(_ call: CAPPluginCall, _ key: String) -> Int64 {
        (call.options[key] as? NSNumber)?.int64Value ?? 0
    }

    /// The five strings per rule that the native side takes: type, string mode,
    /// range mode, negate ("1" or "0"), data.
    private func flatRules(_ call: CAPPluginCall) -> [String] {
        guard let rules = call.options["rules"] as? [[String: Any]] else { return [] }
        var flat: [String] = []
        for rule in rules {
            flat.append(rule["type"] as? String ?? "")
            flat.append(rule["stringMode"] as? String ?? "")
            flat.append(rule["rangeMode"] as? String ?? "")
            flat.append((rule["negate"] as? Bool) == true ? "1" : "0")
            flat.append(rule["data"] as? String ?? "")
        }
        return flat
    }

    private func timestamp() -> Int {
        Int(Date().timeIntervalSince1970 * 1000)
    }

    private var shareDir: URL {
        let dir = FileManager.default.temporaryDirectory.appendingPathComponent("share")
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        return dir
    }

    /// The cloud-test.env file of the home directory, as on Android: the one account
    /// the cloud write lock lets write. Without the file, no cloud account can be written.
    private func readTestEmail() -> String {
        let prefix = "OPENDIVES_CLOUD_TEST_EMAIL="
        guard let text = try? String(contentsOf: home.appendingPathComponent("cloud-test.env"), encoding: .utf8) else { return "" }
        for line in text.split(whereSeparator: { $0.isNewline }) {
            let trimmed = line.trimmingCharacters(in: .whitespaces)
            if trimmed.hasPrefix(prefix) { return String(trimmed.dropFirst(prefix.count)) }
        }
        return ""
    }

    /// After a failed sign-in: the account of this device again, if any.
    private func configureStoredAccount() {
        let stored = credentials.read()
        _ = try? OpenDivesNative.cloudConfigure(email: stored?.email ?? "", password: stored?.password ?? "")
    }

    /// Downloads waiting for the account's first logbook (app cache, deleted after use).
    private func stagedImport(_ path: String) -> URL? {
        let file = URL(fileURLWithPath: path)
        let parent = file.deletingLastPathComponent().resolvingSymlinksInPath().path
        guard parent == cacheDir.resolvingSymlinksInPath().path, file.lastPathComponent.hasPrefix(importPrefix) else {
            return nil
        }
        return file
    }

    // MARK: - Logbook

    @objc func importSample(_ call: CAPPluginCall) {
        onCoreThread(call) { [self] in
            guard let sample = resources.path(forResource: "SampleDivesV2", ofType: "ssrf") else {
                call.reject("Sample log not found", "FAILED")
                return
            }
            var error: NSError?
            let count = OpenDivesNative.importFile(sample, repo: repo, error: &error)
            if let error { throw error }
            call.resolve(["count": count])
        }
    }

    /// The core's JSON goes through as a string and is parsed once, in JavaScript.
    @objc func listDives(_ call: CAPPluginCall) {
        onCoreThread(call) { [self] in
            let exists = OpenDivesNative.logExists(repo)
            let json = exists ? try OpenDivesNative.listDives(repo) : "[]"
            call.resolve(["exists": exists, "json": json])
        }
    }

    @objc func getDive(_ call: CAPPluginCall) {
        guard let id = call.getInt("id") else {
            call.reject("Missing dive id", "BAD_ARGUMENT")
            return
        }
        onCoreThread(call) { [self] in
            resolveObject(call, try OpenDivesNative.getDive(id))
        }
    }

    @objc func plannerSetup(_ call: CAPPluginCall) {
        onCoreThread(call) {
            call.resolve(["json": OpenDivesNative.plannerSetup()])
        }
    }

    @objc func planDive(_ call: CAPPluginCall) {
        guard let request = call.getObject("request"), let text = jsonText(request) else {
            call.reject("Missing plan request", "BAD_ARGUMENT")
            return
        }
        onCoreThread(call) {
            call.resolve(["json": try OpenDivesNative.planDive(text)])
        }
    }

    @objc func getPrefs(_ call: CAPPluginCall) {
        onCoreThread(call, afterSetup: false) {
            call.resolve(["json": OpenDivesNative.getPrefs()])
        }
    }

    @objc func setPrefs(_ call: CAPPluginCall) {
        guard let changes = call.getObject("changes"), let text = jsonText(changes) else {
            call.reject("Missing changes", "BAD_ARGUMENT")
            return
        }
        onCoreThread(call, afterSetup: false) {
            try OpenDivesNative.setPrefs(text)
            call.resolve()
        }
    }

    @objc func cylinderTypes(_ call: CAPPluginCall) {
        let action = call.getString("action") ?? ""
        let name = call.getString("name") ?? ""
        let value = call.getString("value") ?? ""
        let ml = call.getInt("ml") ?? 0
        let mbar = call.getInt("mbar") ?? 0
        onCoreThread(call, afterSetup: false) {
            let json = try OpenDivesNative.cylinderTypes(action: action, name: name, value: value, ml: ml, mbar: mbar)
            call.resolve(["json": json])
        }
    }

    @objc func listPlans(_ call: CAPPluginCall) {
        onCoreThread(call) {
            call.resolve(["json": OpenDivesNative.listPlans()])
        }
    }

    @objc func savePlan(_ call: CAPPluginCall) {
        guard let request = call.getObject("request"), let text = jsonText(request) else {
            call.reject("Missing request", "BAD_ARGUMENT")
            return
        }
        let replaceId = call.getInt("replaceId") ?? 0
        let title = call.getString("title") ?? ""
        onCoreThread(call) {
            call.resolve(["json": try OpenDivesNative.savePlan(text, replaceId: replaceId, title: title)])
        }
    }

    @objc func editDive(_ call: CAPPluginCall) {
        guard let id = call.getInt("id"), let changes = call.getObject("changes"), let text = jsonText(changes) else {
            call.reject("Missing id or changes", "BAD_ARGUMENT")
            return
        }
        onCoreThread(call) {
            call.resolve(["json": try OpenDivesNative.editDive(id, changes: text)])
        }
    }

    @objc func getTrip(_ call: CAPPluginCall) {
        let tripId = call.getInt("tripId") ?? 0
        onCoreThread(call) {
            call.resolve(["json": OpenDivesNative.getTrip(tripId)])
        }
    }

    @objc func tripAction(_ call: CAPPluginCall) {
        let action = call.getString("action") ?? ""
        let tripId = call.getInt("tripId") ?? 0
        let diveId = call.getInt("diveId") ?? 0
        let otherId = call.getInt("otherId") ?? 0
        let diveIds = intList(call, "diveIds").map(numbers)
        let value = call.getString("value") ?? ""
        onCoreThread(call) {
            let json = try OpenDivesNative.tripAction(
                action, tripId: tripId, diveId: diveId, otherId: otherId, diveIds: diveIds, value: value
            )
            call.resolve(["json": json])
        }
    }

    @objc func undo(_ call: CAPPluginCall) {
        let redo = call.getBool("redo", false)
        onCoreThread(call) {
            call.resolve(["json": try OpenDivesNative.undo(redo: redo)])
        }
    }

    /// Local save, then for a cloud log the sync of Subsurface-mobile (fetch, merge, push).
    @objc func syncChanges(_ call: CAPPluginCall) {
        onCoreThread(call) {
            call.resolve(["json": try OpenDivesNative.sync()])
        }
    }

    @objc func listLoadedDives(_ call: CAPPluginCall) {
        onCoreThread(call) {
            call.resolve(["json": OpenDivesNative.listLoadedDives()])
        }
    }

    @objc func saveLocal(_ call: CAPPluginCall) {
        onCoreThread(call) {
            try OpenDivesNative.saveLocal()
            call.resolve()
        }
    }

    @objc func toolQuery(_ call: CAPPluginCall) {
        let kind = call.getString("kind") ?? ""
        let o2 = call.getInt("o2") ?? 0
        let he = call.getInt("he") ?? 0
        let po2 = call.getInt("po2") ?? 0
        let depth = call.getInt("depth") ?? 0
        let args = intList(call, "args").map(numbers)
        onCoreThread(call) {
            let json = try OpenDivesNative.toolQuery(kind: kind, o2: o2, he: he, po2: po2, depth: depth, args: args)
            call.resolve(["json": json])
        }
    }

    @objc func siteQuery(_ call: CAPPluginCall) {
        let kind = call.getString("kind") ?? ""
        let uuid = int64(call, "uuid")
        let lat = call.getInt("lat") ?? 0
        let lon = call.getInt("lon") ?? 0
        let a = call.getInt("a") ?? 0
        let b = call.getInt("b") ?? 0
        let text = call.getString("text") ?? ""
        onCoreThread(call) {
            let json = OpenDivesNative.siteQuery(kind: kind, uuid: uuid, lat: lat, lon: lon, a: a, b: b, text: text)
            call.resolve(["json": json])
        }
    }

    @objc func filterQuery(_ call: CAPPluginCall) {
        let kind = call.getString("kind") ?? ""
        let fulltext = call.getString("fulltext") ?? ""
        let mode = call.getString("mode") ?? ""
        let rules = flatRules(call)
        onCoreThread(call) {
            let json = try OpenDivesNative.filterQuery(kind: kind, fulltext: fulltext, mode: mode, rules: rules)
            call.resolve(["json": json])
        }
    }

    @objc func createDive(_ call: CAPPluginCall) {
        guard let fields = call.getObject("fields"), let text = jsonText(fields) else {
            call.reject("Missing fields", "BAD_ARGUMENT")
            return
        }
        onCoreThread(call) {
            call.resolve(["json": try OpenDivesNative.createDive(text)])
        }
    }

    @objc func deleteDive(_ call: CAPPluginCall) {
        // One dive ("id") or several ("ids"), one undoable step.
        var ids = intList(call, "ids")
        if ids == nil, let id = call.getInt("id") { ids = [id] }
        guard let list = ids, !list.isEmpty else {
            call.reject("Missing id", "BAD_ARGUMENT")
            return
        }
        onCoreThread(call) { [self] in
            call.resolve(["json": try OpenDivesNative.deleteDives(numbers(list))])
        }
    }

    @objc func renumberDives(_ call: CAPPluginCall) {
        guard let start = call.getInt("start") else {
            call.reject("Missing start", "BAD_ARGUMENT")
            return
        }
        let ids = intList(call, "ids") ?? []
        let renumbers = intList(call, "numbers") ?? []
        onCoreThread(call) { [self] in
            let json = try OpenDivesNative.renumberDives(ids: numbers(ids), start: start, numbers: numbers(renumbers))
            call.resolve(["json": json])
        }
    }

    /// A file chosen in the WebView: its bytes arrive in base64, are written to a
    /// temporary file with the original name (the core reads the format from it),
    /// imported, then the copy is deleted.
    @objc func importDives(_ call: CAPPluginCall) {
        var name = ((call.getString("name") ?? "") as NSString).lastPathComponent
        if name.isEmpty { name = "import.xml" }
        guard let data = call.getString("data") else {
            call.reject("Missing data", "BAD_ARGUMENT")
            return
        }
        let importName = name
        onCoreThread(call) { [self] in
            let dir = cacheDir.appendingPathComponent("import")
            try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
            let file = dir.appendingPathComponent(importName)
            defer { try? FileManager.default.removeItem(at: file) }
            guard let bytes = Data(base64Encoded: data, options: .ignoreUnknownCharacters) else {
                throw Failure("CORE_ERROR", "Invalid base64 data")
            }
            try bytes.write(to: file)
            call.resolve(["json": try OpenDivesNative.importDives(file: file.path, source: importName)])
        }
    }

    /// The dives logged on this device without an account, once an account is used:
    /// "count" reads them apart; "import" adds them to the account's log in memory.
    @objc func deviceLog(_ call: CAPPluginCall) {
        let action = call.getString("action")
        onCoreThread(call) { [self] in
            let exists = OpenDivesNative.logExists(repo)
            switch action {
            case "count":
                let count = exists ? try OpenDivesNative.countDives(repo).intValue : 0
                call.resolve(["count": count])
            case "import":
                if !exists {
                    call.reject("NO_DIVES", "NO_DIVES")
                    return
                }
                call.resolve(["json": try OpenDivesNative.importDives(file: repo, source: "this device")])
            default:
                call.reject("BAD_REQUEST", "BAD_REQUEST")
            }
        }
    }

    @objc func filterPresets(_ call: CAPPluginCall) {
        let action = call.getString("action") ?? ""
        let name = call.getString("name") ?? ""
        let fulltext = call.getString("fulltext") ?? ""
        let mode = call.getString("mode") ?? ""
        let rules = flatRules(call)
        let index = call.getInt("index") ?? -1
        onCoreThread(call) {
            let json = try OpenDivesNative.filterPresets(
                action: action, name: name, fulltext: fulltext, mode: mode, rules: rules, index: index
            )
            call.resolve(["json": json])
        }
    }

    @objc func syncConflicts(_ call: CAPPluginCall) {
        onCoreThread(call, afterSetup: false) {
            call.resolve(["json": try OpenDivesNative.syncConflicts()])
        }
    }

    @objc func resolveConflicts(_ call: CAPPluginCall) {
        guard let choices = call.getObject("choices"), let text = jsonText(choices) else {
            call.reject("Missing choices", "BAD_ARGUMENT")
            return
        }
        onCoreThread(call) {
            try OpenDivesNative.resolveConflicts(text)
            call.resolve()
        }
    }

    @objc func cancelConflictResolution(_ call: CAPPluginCall) {
        onCoreThread(call) {
            try OpenDivesNative.cancelConflictResolution()
            call.resolve()
        }
    }

    /// kind "stats" with `criteria` ({field: [values]}), or "values" with `field`.
    @objc func statsQuery(_ call: CAPPluginCall) {
        let kind = call.getString("kind") ?? ""
        let text: String
        if kind == "values" {
            text = call.getString("field") ?? ""
        } else {
            text = call.getObject("criteria").flatMap { jsonText($0) } ?? "{}"
        }
        onCoreThread(call) {
            call.resolve(["json": try OpenDivesNative.statsQuery(kind: kind, text: text)])
        }
    }

    @objc func siteAction(_ call: CAPPluginCall) {
        let action = call.getString("action") ?? ""
        let uuid = int64(call, "uuid")
        let other = int64(call, "other")
        let uuids: [NSNumber]? = (call.options["uuids"] as? [Any])?.compactMap { $0 as? NSNumber }
        let field = call.getString("field") ?? ""
        let value = call.getString("value") ?? ""
        let lat = call.getInt("lat") ?? 0
        let lon = call.getInt("lon") ?? 0
        onCoreThread(call) {
            let json = try OpenDivesNative.siteAction(
                action, uuid: uuid, other: other, uuids: uuids, field: field, value: value, lat: lat, lon: lon
            )
            call.resolve(["json": json])
        }
    }

    @objc func diveComputers(_ call: CAPPluginCall) {
        onCoreThread(call) {
            call.resolve(["json": OpenDivesNative.diveComputers()])
        }
    }

    @objc func diveComputerAction(_ call: CAPPluginCall) {
        let action = call.getString("action") ?? ""
        let model = call.getString("model") ?? ""
        let serial = call.getString("serial") ?? ""
        let value = call.getString("value") ?? ""
        let intoModel = call.getString("intoModel") ?? ""
        let intoSerial = call.getString("intoSerial") ?? ""
        onCoreThread(call) {
            let json = try OpenDivesNative.diveComputerAction(
                action, model: model, serial: serial, value: value, intoModel: intoModel, intoSerial: intoSerial
            )
            call.resolve(["json": json])
        }
    }

    // MARK: - Cloud account and own git repository

    /// The user's own git repository when one was connected (it takes the place of
    /// the cloud account; `email` is then the user name), else the stored account.
    @objc func configureCloud(_ call: CAPPluginCall) {
        onCoreThread(call, afterSetup: false) { [self] in
            if let remote = gitStore.read() {
                do {
                    try OpenDivesNative.gitConfigure(
                        url: remote.address, username: remote.username, token: remote.token, branch: remote.branch
                    )
                    var repository = remote.address
                    if let range = repository.range(of: "://") { repository = String(repository[range.upperBound...]) }
                    call.resolve([
                        "available": true, "email": remote.username, "mode": "git", "repository": repository,
                    ])
                    return
                } catch {
                    CAPLog.print("OpenDives: the stored repository cannot be used: \(error.localizedDescription)")
                }
            }
            let stored = credentials.read()
            if let stored { try OpenDivesNative.cloudConfigure(email: stored.email, password: stored.password) }
            // Write lock: writing to the cloud is allowed only for the test account.
            OpenDivesNative.setCloudTestEmail(readTestEmail())
            // The account email is shown on the Account screen; the password never leaves the plugin.
            call.resolve(["available": stored != nil, "email": stored?.email ?? ""])
        }
    }

    @objc func probeCloud(_ call: CAPPluginCall) {
        onNetworkThread(call) {
            call.resolve(["json": try OpenDivesNative.cloudProbe()])
        }
    }

    /// `cached: true` reads the device's copy only, without network (after configureCloud);
    /// `json` is then empty when there is no copy yet.
    @objc func listCloudDives(_ call: CAPPluginCall) {
        let cached = call.getBool("cached", false)
        onCoreThread(call, afterSetup: !cached) { [self] in
            let json: String
            if cached {
                json = try OpenDivesNative.cloudListCachedDives()
            } else if gitStore.read() != nil {
                // Own git repository, set by configureCloud: the arguments are ignored.
                json = try OpenDivesNative.cloudListDives(email: "", password: "")
            } else {
                guard let stored = credentials.read() else {
                    call.resolve(["available": false])
                    return
                }
                json = try OpenDivesNative.cloudListDives(email: stored.email, password: stored.password)
            }
            call.resolve(["available": true, "json": json])
        }
    }

    @objc func pendingChanges(_ call: CAPPluginCall) {
        onCoreThread(call, afterSetup: false) {
            call.resolve(["json": OpenDivesNative.pendingChanges()])
        }
    }

    @objc func signOut(_ call: CAPPluginCall) {
        let deleteCopy = call.getBool("deleteCopy", false)
        onCoreThread(call) { [self] in
            try OpenDivesNative.cloudSignOut(deleteCopy: deleteCopy)
            credentials.delete()
            gitStore.delete()  // the token is erased from this device
            pendingAccount = nil
            call.resolve()
        }
    }

    /// With keepDives, the dives are first saved as a new log without account; once
    /// the server confirms, it becomes the device's log and the previous one is kept aside.
    @objc func deleteAccount(_ call: CAPPluginCall) {
        let password = call.getString("password") ?? ""
        let keepDives = call.getBool("keepDives", true)
        onCoreThread(call) { [self] in
            let fileManager = FileManager.default
            let kept = home.appendingPathComponent("carnet.new")
            if fileManager.fileExists(atPath: kept.path) { try? fileManager.removeItem(at: kept) }
            let json = try OpenDivesNative.cloudDeleteAccount(
                password: password, keepDivesIn: keepDives ? kept.path + "[main]" : ""
            )
            let deleted = parseObject(json)["deleted"] as? Bool ?? false
            if deleted {
                credentials.delete()
                if keepDives {
                    if fileManager.fileExists(atPath: repoDir.path) {
                        let aside = home.appendingPathComponent("carnet.before-\(timestamp())")
                        try? fileManager.moveItem(at: repoDir, to: aside)
                    }
                    try? fileManager.moveItem(at: kept, to: repoDir)
                }
            } else if fileManager.fileExists(atPath: kept.path) {
                try? fileManager.removeItem(at: kept)
            }
            call.resolve(["json": json])
        }
    }

    /// The account is set, then the server is asked for its log branch (cloud_probe),
    /// which checks the password. Rejects with INCORRECT or NETWORK; the previous
    /// account is then set again. With a logbook on the server, the credentials are
    /// stored; without one they wait in memory for createLog. Never logged.
    @objc func signIn(_ call: CAPPluginCall) {
        // "email address MUST be lower case" (Subsurface-mobile).
        let email = (call.getString("email") ?? "").trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        let password = call.getString("password") ?? ""
        onCoreThread(call) { [self] in
            OpenDivesNative.setCloudTestEmail(readTestEmail())
            try OpenDivesNative.cloudConfigure(email: email, password: password)
            let json: String
            do {
                json = try OpenDivesNative.cloudProbe()
            } catch {
                configureStoredAccount()
                let code = error.localizedDescription.contains("Credentials rejected") ? "INCORRECT" : "NETWORK"
                call.reject(code, code)
                return
            }
            let exists = parseObject(json)["exists"] as? Bool ?? false
            if exists {
                try credentials.write(email, password)
                pendingAccount = nil
            } else {
                pendingAccount = (email, password)
            }
            call.resolve(["exists": exists, "email": email])
        }
    }

    /// New account, step 1 (a cloud write, under the write lock). "need_pin": the
    /// server mailed a code, the credentials wait in memory for verifyPin.
    @objc func createAccount(_ call: CAPPluginCall) {
        let email = (call.getString("email") ?? "").trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        let password = call.getString("password") ?? ""
        onCoreThread(call) { [self] in
            OpenDivesNative.setCloudTestEmail(readTestEmail())
            let json = try OpenDivesNative.cloudCreateAccount(email: email, password: password)
            let status = parseObject(json)["status"] as? String ?? ""
            if status == "need_pin" { pendingAccount = (email, password) }
            call.resolve(["status": status, "email": email])
        }
    }

    /// The same request as createAccount, for the account waiting for its code.
    @objc func resendCode(_ call: CAPPluginCall) {
        onCoreThread(call) { [self] in
            guard let account = pendingAccount else {
                call.reject("NO_ACCOUNT", "NO_ACCOUNT")
                return
            }
            OpenDivesNative.setCloudTestEmail(readTestEmail())
            let json = try OpenDivesNative.cloudCreateAccount(email: account.email, password: account.password)
            call.resolve(["status": parseObject(json)["status"] as? String ?? ""])
        }
    }

    /// The confirmation code of the new account. "verified": the account is set (in memory).
    @objc func verifyPin(_ call: CAPPluginCall) {
        let pin = (call.getString("pin") ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        onCoreThread(call) { [self] in
            guard let account = pendingAccount else {
                call.reject("NO_ACCOUNT", "NO_ACCOUNT")
                return
            }
            OpenDivesNative.setCloudTestEmail(readTestEmail())
            let json = try OpenDivesNative.cloudVerifyPin(email: account.email, password: account.password, pin: pin)
            let status = parseObject(json)["status"] as? String ?? ""
            if status == "verified" {
                try OpenDivesNative.cloudConfigure(email: account.email, password: account.password)
            }
            call.resolve(["status": status])
        }
    }

    /// Asks a repository server for its references: anonymous, or, with a token, as
    /// for a push. With `useStored` and no token typed, the stored one. Network only.
    @objc func gitCheck(_ call: CAPPluginCall) {
        let url = call.getString("url") ?? ""
        let typedUser = (call.getString("username") ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        let typedToken = (call.getString("token") ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        let useStored = call.getBool("useStored", false)
        networkQueue.async { [self] in
            setupDone.wait()
            var username = typedUser
            var token = typedToken
            if useStored && token.isEmpty, let stored = gitStore.read() {
                username = stored.username
                token = stored.token
            }
            do {
                call.resolve(["json": try OpenDivesNative.gitCheck(url: url, username: username, token: token)])
            } catch {
                // BAD_ADDRESS or BAD_CREDENTIALS, from the core.
                let message = error.localizedDescription
                call.reject(message, message.components(separatedBy: ":")[0])
            }
        }
    }

    /// The stored repository without its token, for the form that edits it.
    @objc func gitConfig(_ call: CAPPluginCall) {
        let stored = gitStore.read()
        call.resolve([
            "url": stored?.address ?? "",
            "username": stored?.username ?? "",
            "branch": stored?.branch ?? "",
        ])
    }

    /// Uses the repository for the logbook: sets it in the core, asks the server for
    /// the log branch and, for a repository that holds no reference (`empty`), creates
    /// it. The access is then stored in the Keychain. On any failure the previous
    /// repository (or account) is set again and nothing is stored. The token is never logged.
    @objc func gitConnect(_ call: CAPPluginCall) {
        let url = call.getString("url") ?? ""
        let username = (call.getString("username") ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        let branch = (call.getString("branch") ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        let typedToken = (call.getString("token") ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        let empty = call.getBool("empty", false)
        onCoreThread(call) { [self] in
            let previous = gitStore.read()
            // The form that edits the repository leaves the token empty to keep it.
            let token = typedToken.isEmpty ? (previous?.token ?? "") : typedToken
            do {
                try OpenDivesNative.gitConfigure(url: url, username: username, token: token, branch: branch)
                var created = false
                let probe = try OpenDivesNative.cloudProbe()
                if !(parseObject(probe)["exists"] as? Bool ?? false) {
                    if !empty { throw Failure("NO_LOG") }
                    _ = try OpenDivesNative.gitCreateLog()
                    created = true
                }
                var address = url.trimmingCharacters(in: .whitespacesAndNewlines)
                while address.hasSuffix("/") { address.removeLast() }
                try gitStore.write(GitRemote(url: "\(address)[\(branch)]", username: username, branch: branch, token: token))
                call.resolve(["created": created])
            } catch {
                if let failure = error as? Failure, failure.message == GitRemoteStore.invalidMessage { throw failure }
                restoreAfterFailedGitConnect(previous)
                let message = (error as? Failure)?.message ?? error.localizedDescription
                var code = message.components(separatedBy: ":")[0]
                if message.contains("Credentials rejected") {
                    code = "DENIED"
                } else if code.isEmpty {
                    code = "CORE_ERROR"
                }
                let known: Set<String> = [
                    "BAD_ADDRESS", "BAD_CREDENTIALS", "BAD_BRANCH", "DENIED", "NO_LOG", "CREATE_FAILED", "LOG_EXISTS", "NOT_EMPTY",
                ]
                let final = known.contains(code) ? code : "NETWORK"
                call.reject(final, final)
            }
        }
    }

    /// After a refused connection: the repository (or cloud account) the device had is set again.
    private func restoreAfterFailedGitConnect(_ previous: GitRemote?) {
        if let previous {
            _ = try? OpenDivesNative.gitConfigure(
                url: previous.address, username: previous.username, token: previous.token, branch: previous.branch
            )
        } else {
            configureStoredAccount()
        }
    }

    // MARK: - Import (divelogs.de, files) and the account's first logbook

    /// Import, step 1: downloads the divelogs.de logbook once into the app's cache.
    /// The credentials are only passed to the core, never kept or logged.
    @objc func divelogsDownload(_ call: CAPPluginCall) {
        let user = call.getString("user") ?? ""
        let password = call.getString("password") ?? ""
        onCoreThread(call) { [self] in
            let target = cacheDir.appendingPathComponent("\(importPrefix)\(timestamp()).dld")
            do {
                let json = try OpenDivesNative.divelogsDownload(user: user, password: password, outPath: target.path)
                let dives = parseObject(json)["dives"] as? Int ?? 0
                call.resolve(["dives": dives, "path": dives > 0 ? target.path : ""])
            } catch {
                try? FileManager.default.removeItem(at: target)
                throw error
            }
        }
    }

    @objc func divelogsCheck(_ call: CAPPluginCall) {
        let user = call.getString("user") ?? ""
        let password = call.getString("password") ?? ""
        onCoreThread(call) { [self] in
            resolveObject(call, try OpenDivesNative.divelogsCheck(user: user, password: password))
        }
    }

    /// A file picked in the web layer (`name`, base64 `data`) written to the app's
    /// cache for the import steps (importCount, createLog).
    @objc func stageImport(_ call: CAPPluginCall) {
        var name = ((call.getString("name") ?? "") as NSString).lastPathComponent
        name = name.replacingOccurrences(of: "[^A-Za-z0-9._-]", with: "_", options: .regularExpression)
        if name.isEmpty { name = "import.xml" }
        let fileName = name
        guard let data = call.getString("data") else {
            call.reject("BAD_REQUEST", "BAD_REQUEST")
            return
        }
        onCoreThread(call) { [self] in
            let file = cacheDir.appendingPathComponent("\(importPrefix)\(timestamp())-\(fileName)")
            guard let bytes = Data(base64Encoded: data, options: .ignoreUnknownCharacters) else {
                throw Failure("CORE_ERROR", "Invalid base64 data")
            }
            try bytes.write(to: file)
            call.resolve(["path": file.path])
        }
    }

    @objc func importCount(_ call: CAPPluginCall) {
        let path = call.getString("path") ?? ""
        onCoreThread(call) { [self] in
            guard let file = stagedImport(path) else {
                call.reject("BAD_REQUEST", "BAD_REQUEST")
                return
            }
            resolveObject(call, try OpenDivesNative.importCount(file.path))
        }
    }

    @objc func discardImport(_ call: CAPPluginCall) {
        let path = call.getString("path") ?? ""
        onCoreThread(call) { [self] in
            if let file = stagedImport(path) { try? FileManager.default.removeItem(at: file) }
            call.resolve()
        }
    }

    /// First logbook of the account just created or signed in to (the only step that
    /// writes to the account): "empty"; "import", the file of divelogsDownload or
    /// stageImport (`path`, deleted afterwards); or "device", the logbook of this
    /// device. The account's credentials are then stored.
    @objc func createLog(_ call: CAPPluginCall) {
        let source = call.getString("source") ?? ""
        let path = call.getString("path") ?? ""
        onCoreThread(call) { [self] in
            guard let account = pendingAccount else {
                call.reject("NO_ACCOUNT", "NO_ACCOUNT")
                return
            }
            OpenDivesNative.setCloudTestEmail(readTestEmail())
            try OpenDivesNative.cloudConfigure(email: account.email, password: account.password)
            var download: URL?
            let importPath: String
            switch source {
            case "import":
                guard let file = stagedImport(path) else {
                    call.reject("BAD_REQUEST", "BAD_REQUEST")
                    return
                }
                download = file
                importPath = file.path
            case "device":
                importPath = OpenDivesNative.logExists(repo) ? repo : ""
            case "empty":
                importPath = ""
            default:
                call.reject("BAD_REQUEST", "BAD_REQUEST")
                return
            }
            defer {
                if let download { try? FileManager.default.removeItem(at: download) }
            }
            let json = try OpenDivesNative.cloudCreateLog(importPath: importPath)
            try credentials.write(account.email, account.password)
            pendingAccount = nil
            call.resolve(["json": json])
        }
    }

    // MARK: - Network

    /// A Nominatim request, sent with the app's identification (its usage policy).
    @objc func placesSearch(_ call: CAPPluginCall) {
        guard let address = call.getString("url"),
              address.hasPrefix("https://nominatim.openstreetmap.org/"),
              let url = URL(string: address)
        else {
            call.reject("Bad address", "BAD_ARGUMENT")
            return
        }
        var request = URLRequest(url: url, timeoutInterval: 15)
        request.setValue(MapsManager.userAgent, forHTTPHeaderField: "User-Agent")
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        URLSession.shared.dataTask(with: request) { data, response, error in
            guard let http = response as? HTTPURLResponse else {
                call.reject(error?.localizedDescription ?? "Cannot reach the server", "NETWORK")
                return
            }
            let body = (200...299).contains(http.statusCode) ? String(data: data ?? Data(), encoding: .utf8) ?? "" : ""
            call.resolve(["status": http.statusCode, "body": body])
        }.resume()
    }

    /// Whether the device is on Wi-Fi or Ethernet.
    @objc func networkStatus(_ call: CAPPluginCall) {
        let monitor = NWPathMonitor()
        var answered = false
        monitor.pathUpdateHandler = { path in
            if answered { return }
            answered = true
            monitor.cancel()
            let wifi = path.status == .satisfied && (path.usesInterfaceType(.wifi) || path.usesInterfaceType(.wiredEthernet))
            call.resolve(["wifi": wifi])
        }
        monitor.start(queue: DispatchQueue(label: "org.opendives.core.path"))
    }

    // MARK: - Offline maps (MapsManager)

    /// Reads the tiles and loads the maps state, off the main thread.
    private let mapsIo = DispatchQueue(label: "org.opendives.maps.io", attributes: .concurrent)

    /// The region id of a call: letters, digits, dot, dash, underscore (it names a directory).
    private func mapsId(_ call: CAPPluginCall) -> String? {
        guard let id = call.getString("id"), MapsManager.isValidId(id) else {
            call.reject("Bad region id", "BAD_ARGUMENT")
            return nil
        }
        return id
    }

    /// An integer of the call, whatever form the bridge gives it; nil when absent or not a number.
    private func number(_ call: CAPPluginCall, _ key: String) -> Double? {
        (call.options[key] as? NSNumber)?.doubleValue
    }

    @objc func mapsFreeSpace(_ call: CAPPluginCall) {
        mapsIo.async {
            let (free, total) = MapsManager.shared.freeSpace()
            call.resolve(["freeBytes": free, "totalBytes": total])
        }
    }

    /// Queues a region ({id, bbox, maxZoom, urlTemplate, version, allowCellular,
    /// title}). Rejects with TOO_MANY_TILES above 3,000 tiles (counted here,
    /// whatever the caller says) or BAD_ARGUMENT. No notification on iOS, so no
    /// permission to ask.
    @objc func mapsTilesStart(_ call: CAPPluginCall) {
        guard let id = mapsId(call) else { return }
        let raw = call.options["bbox"] as? [Any]
        let bbox = raw?.count == 4 ? raw!.map { ($0 as? NSNumber)?.doubleValue ?? .nan } : nil
        let zoom = number(call, "maxZoom")
        let maxZoom = zoom.flatMap { $0 == $0.rounded() ? Int(exactly: $0) : nil } ?? 0
        let urlTemplate = call.getString("urlTemplate")
        if let error = MapsManager.check(bbox, maxZoom, urlTemplate) {
            call.reject(error == "TOO_MANY_TILES" ? "More than \(MapsManager.maxTiles) tiles" : "Bad region request", error)
            return
        }
        let version = call.getString("version") ?? ""
        let allowCellular = call.getBool("allowCellular") ?? false
        let title = call.getString("title") ?? id
        mapsIo.async {
            MapsManager.shared.load()
            MapsManager.shared.start(id: id, bbox: bbox!, maxZoom: maxZoom, urlTemplate: urlTemplate!,
                                     version: version, allowCellular: allowCellular, title: title)
            call.resolve()
        }
    }

    @objc func mapsDownloadPause(_ call: CAPPluginCall) {
        guard let id = mapsId(call) else { return }
        mapsIo.async {
            MapsManager.shared.load()
            MapsManager.shared.pause(id)
            call.resolve()
        }
    }

    @objc func mapsDownloadResume(_ call: CAPPluginCall) {
        guard let id = mapsId(call) else { return }
        let allowCellular = call.getBool("allowCellular") ?? false
        mapsIo.async {
            MapsManager.shared.load()
            MapsManager.shared.resume(id, allowCellular: allowCellular)
            call.resolve()
        }
    }

    @objc func mapsDownloadCancel(_ call: CAPPluginCall) {
        guard let id = mapsId(call) else { return }
        mapsIo.async {
            MapsManager.shared.load()
            MapsManager.shared.cancel(id)
            call.resolve()
        }
    }

    @objc func mapsDownloads(_ call: CAPPluginCall) {
        mapsIo.async {
            MapsManager.shared.load()
            call.resolve(["downloads": MapsManager.shared.downloads().map(\.event)])
        }
    }

    @objc func mapsFiles(_ call: CAPPluginCall) {
        mapsIo.async {
            MapsManager.shared.load()
            let files = MapsManager.shared.files().map {
                ["id": $0.id, "sizeBytes": $0.sizeBytes, "version": $0.version, "maxZoom": $0.maxZoom] as [String: Any]
            }
            call.resolve(["files": files])
        }
    }

    @objc func mapsDelete(_ call: CAPPluginCall) {
        guard let id = mapsId(call) else { return }
        mapsIo.async {
            MapsManager.shared.load()
            MapsManager.shared.delete(id)
            call.resolve()
        }
    }

    /// One tile of a ready region, base64 ('' for an empty tile). Rejects with NOT_FOUND.
    @objc func mapsReadTile(_ call: CAPPluginCall) {
        guard let id = mapsId(call) else { return }
        let z = number(call, "z").flatMap { Int(exactly: $0) } ?? -1
        let x = number(call, "x").flatMap { Int(exactly: $0) } ?? -1
        let y = number(call, "y").flatMap { Int(exactly: $0) } ?? -1
        if z < 0 || x < 0 || y < 0 {
            call.reject("Bad tile", "BAD_ARGUMENT")
            return
        }
        mapsIo.async {
            do {
                guard let data = try MapsManager.shared.readTile(id, z, x, y) else {
                    call.reject("No such tile", "NOT_FOUND")
                    return
                }
                call.resolve(["base64": data.base64EncodedString()])
            } catch {
                call.reject(error.localizedDescription, "FAILED")
            }
        }
    }

    // MARK: - Bluetooth and download from a dive computer

    private func bluetoothStatus(_ call: CAPPluginCall, prompting: Bool) {
        bluetoothState.current(prompting: prompting) { state in
            call.resolve(["bluetooth": state, "permission": ODBluetoothScan.permissionState()])
        }
    }

    @objc func bluetoothStatus(_ call: CAPPluginCall) {
        bluetoothStatus(call, prompting: false)
    }

    /// The permission is asked at the first use of CoreBluetooth: creating the
    /// manager makes iOS show the prompt; resolves once it is answered.
    @objc func requestBluetoothPermission(_ call: CAPPluginCall) {
        bluetoothStatus(call, prompting: ODBluetoothScan.permissionState() != "granted")
    }

    /// An app cannot turn Bluetooth on on iOS: the status as it is.
    @objc func enableBluetooth(_ call: CAPPluginCall) {
        bluetoothStatus(call, prompting: false)
    }

    /// The first screen is drawn (Android splash gate): nothing to do here.
    /// The first screen is drawn: the launch screen goes (LaunchCover).
    @objc func contentShown(_ call: CAPPluginCall) {
        DispatchQueue.main.async { LaunchCover.hide() }
        call.resolve()
    }

    /// The QR scanner (QrScanController): the codes of a dive or a plan from another phone.
    /// Resolves with {action: "cancelled"} or {action: "done", codes: [...]}.
    @objc func qrScan(_ call: CAPPluginCall) {
        let options = call.options as? [String: Any] ?? [:]
        DispatchQueue.main.async { [self] in
            guard let host = bridge?.viewController else {
                call.reject("No screen to show the camera", "FAILED")
                return
            }
            let scanner = QrScanController(options: options) { codes in
                if let codes {
                    call.resolve(["action": "done", "codes": codes])
                } else {
                    call.resolve(["action": "cancelled"])
                }
            }
            host.present(scanner, animated: true)
        }
    }

    /// The brightness the screen had before keepScreenAwake raised it.
    private var savedBrightness: CGFloat?

    /// The sending screen of a QR share: no auto-lock and full brightness while `on`; both
    /// restored when it is off.
    @objc func keepScreenAwake(_ call: CAPPluginCall) {
        let on = call.getBool("on", false)
        DispatchQueue.main.async { [self] in
            if on {
                if savedBrightness == nil { savedBrightness = UIScreen.main.brightness }
                UIApplication.shared.isIdleTimerDisabled = true
                UIScreen.main.brightness = 1
            } else {
                UIApplication.shared.isIdleTimerDisabled = false
                if let saved = savedBrightness { UIScreen.main.brightness = saved }
                savedBrightness = nil
            }
            call.resolve()
        }
    }

    /// True for an App Store install: neither TestFlight (sandbox receipt) nor a development build (no receipt).
    @objc func installSource(_ call: CAPPluginCall) {
        let receipt = Bundle.main.appStoreReceiptURL?.lastPathComponent
        call.resolve(["store": receipt == "receipt", "installer": ""])
    }

    /// The system review dialog; the App Store decides whether it shows.
    @objc func requestReview(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            if let scene = UIApplication.shared.connectedScenes.first(where: { $0.activationState == .foregroundActive }) as? UIWindowScene {
                SKStoreReviewController.requestReview(in: scene)
                call.resolve(["requested": true])
            } else {
                call.resolve(["requested": false])
            }
        }
    }

    /// The App Store page, on its review form. The numeric Apple ID is the Info.plist key ODAppStoreId.
    @objc func openStorePage(_ call: CAPPluginCall) {
        guard let id = Bundle.main.object(forInfoDictionaryKey: "ODAppStoreId") as? String, !id.isEmpty,
              let url = URL(string: "https://apps.apple.com/app/id(id)?action=write-review") else {
            call.reject("No App Store identifier", "NO_STORE_ID")
            return
        }
        DispatchQueue.main.async {
            UIApplication.shared.open(url) { _ in call.resolve() }
        }
    }

    @objc func openAppSettings(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            if let url = URL(string: UIApplication.openSettingsURLString) {
                UIApplication.shared.open(url, options: [:], completionHandler: nil)
            }
            call.resolve()
        }
    }

    private func currentScan() -> ODBluetoothScan {
        stateLock.lock()
        defer { stateLock.unlock() }
        if let scan { return scan }
        let created = ODBluetoothScan(
            computerForName: { name in OpenDivesNative.dcFromBluetoothName(name) },
            onDevice: { [weak self] event in self?.notifyListeners("bluetoothDevice", data: event) },
            onStopped: { [weak self] in self?.notifyListeners("bluetoothScanStopped", data: [:]) }
        )
        scan = created
        return created
    }

    private func existingScan() -> ODBluetoothScan? {
        stateLock.lock()
        defer { stateLock.unlock() }
        return scan
    }

    /// Looks for dive computers for `durationMs` (default 60 s): "bluetoothDevice"
    /// events, then "bluetoothScanStopped". Rejects with NO_BLUETOOTH, BLUETOOTH_OFF, PERMISSION.
    @objc func startBluetoothScan(_ call: CAPPluginCall) {
        let duration = (call.options["durationMs"] as? NSNumber)?.intValue ?? 60_000
        currentScan().start(withDurationMs: duration) { code in
            // CANCELLED: the diver stopped the scan before Bluetooth answered.
            if let code, code != "CANCELLED" {
                call.reject(code, code)
            } else {
                call.resolve()
            }
        }
    }

    @objc func stopBluetoothScan(_ call: CAPPluginCall) {
        existingScan()?.stop()
        call.resolve()
    }

    /// Models that download over Bluetooth, for a device whose name says nothing.
    @objc func bluetoothModels(_ call: CAPPluginCall) {
        DispatchQueue.global(qos: .userInitiated).async {
            call.resolve(["json": OpenDivesNative.dcBluetoothModels()])
        }
    }

    private func keepScreenOn(_ on: Bool) {
        DispatchQueue.main.async {
            UIApplication.shared.isIdleTimerDisabled = on
        }
    }

    /// Downloads the new dives of a dive computer and adds them to the logbook as one
    /// undoable step: {vendor, product, address ("LE:" + MAC), name, forceDownload,
    /// defaultSalinity}. Progress comes as "downloadProgress" events ({json}). There is
    /// no Bluetooth Classic on iOS: `classicAddress` is never passed on.
    @objc func downloadDives(_ call: CAPPluginCall) {
        let request: [String: Any] = [
            "vendor": call.getString("vendor") ?? "",
            "product": call.getString("product") ?? "",
            "address": call.getString("address") ?? "",
            "name": call.getString("name") ?? "",
            "forceDownload": call.getBool("forceDownload", false),
            "defaultSalinity": call.getInt("defaultSalinity") ?? 0,
            "logFile": home.appendingPathComponent("libdivecomputer.log").path,
        ]
        guard let data = try? JSONSerialization.data(withJSONObject: request),
              let text = String(data: data, encoding: .utf8)
        else {
            call.reject("Bad request", "BAD_ARGUMENT")
            return
        }
        bluetoothState.current(prompting: false) { [self] state in
            if state == "none" { return call.reject("NO_BLUETOOTH", "NO_BLUETOOTH") }
            if ODBluetoothScan.permissionState() != "granted" { return call.reject("PERMISSION", "PERMISSION") }
            if state == "off" { return call.reject("BLUETOOTH_OFF", "BLUETOOTH_OFF") }
            // As Subsurface: the scan stops before connecting.
            existingScan()?.stop()
            OpenDivesNative.resetBluetoothTransport()
            keepScreenOn(true)
            coreQueue.async { [self] in
                defer { keepScreenOn(false) }
                do {
                    let json = try OpenDivesNative.downloadDives(request: text) { [weak self] progress in
                        self?.notifyListeners("downloadProgress", data: ["json": progress])
                    }
                    call.resolve(["json": json])
                } catch {
                    reject(call, error)
                }
            }
        }
    }

    /// The dives received before a download failed or was cancelled: "count", "keep"
    /// (one undoable step, the object of downloadDives) or "discard".
    @objc func downloadPartial(_ call: CAPPluginCall) {
        let action = call.getString("action") ?? ""
        onCoreThread(call) {
            call.resolve(["json": try OpenDivesNative.downloadPartial(action)])
        }
    }

    /// Stops the running download (off the core queue, which is busy with it).
    @objc func cancelDownload(_ call: CAPPluginCall) {
        OpenDivesNative.downloadCancel()
        call.resolve()
    }

    // MARK: - A file sent to the app (deep links, "Open in OpenDives")

    /// Reads a file another app handed over (a file:// URL of the Inbox or of a provider):
    /// its name, its size and its contents in base64. The web layer decides whether it is a
    /// logbook (lib/deep-link.js). Rejects TOO_BIG above 100 MB, NOT_FOUND, FAILED.
    @objc func readSharedFile(_ call: CAPPluginCall) {
        guard let text = call.getString("uri"), !text.isEmpty else {
            call.reject("Missing uri", "BAD_ARGUMENT")
            return
        }
        guard let url = URL(string: text), url.isFileURL else {
            call.reject("Not a file", "BAD_ARGUMENT")
            return
        }
        DispatchQueue.global(qos: .userInitiated).async {
            // A file opened in place (outside the app) needs its security scope.
            let scoped = url.startAccessingSecurityScopedResource()
            defer { if scoped { url.stopAccessingSecurityScopedResource() } }
            do {
                let size = (try url.resourceValues(forKeys: [.fileSizeKey]).fileSize) ?? 0
                if size > 100 * 1024 * 1024 {
                    call.reject("The file is too big", "TOO_BIG")
                    return
                }
                let bytes = try Data(contentsOf: url)
                call.resolve([
                    "name": url.lastPathComponent,
                    "size": bytes.count,
                    "data": bytes.base64EncodedString(),
                ])
            } catch let error as NSError where error.code == NSFileReadNoSuchFileError {
                call.reject("Cannot open the file", "NOT_FOUND")
            } catch {
                call.reject("Cannot read the file", "FAILED")
            }
        }
    }

    // MARK: - Sharing and export

    /// A file to share (the profile image), written in the temporary directory; its file URL.
    @objc func writeShareFile(_ call: CAPPluginCall) {
        guard let name = call.getString("name"), !name.isEmpty, let base64 = call.getString("base64") else {
            call.reject("Missing name or data", "BAD_ARGUMENT")
            return
        }
        DispatchQueue.global(qos: .userInitiated).async { [self] in
            do {
                guard let bytes = Data(base64Encoded: base64, options: .ignoreUnknownCharacters) else {
                    throw Failure("FAILED")
                }
                let file = shareDir.appendingPathComponent((name as NSString).lastPathComponent)
                try bytes.write(to: file)
                call.resolve(["uri": file.absoluteString])
            } catch {
                call.reject("Cannot write the file", "FAILED")
            }
        }
    }

    /// Android grants read access to the apps that can receive the file; the iOS
    /// share sheet hands the file over itself, so there is nothing to grant.
    @objc func grantShareFile(_ call: CAPPluginCall) {
        guard call.getString("uri") != nil else {
            call.reject("Missing uri", "BAD_ARGUMENT")
            return
        }
        call.resolve(["apps": 0])
    }

    /// The dives exported by the core into the temporary directory, shared from there.
    @objc func exportDives(_ call: CAPPluginCall) {
        let ids = intList(call, "ids") ?? []
        let format = call.getString("format") ?? ""
        let name = call.getString("name") ?? ""
        let anonymize = call.getBool("anonymize", false)
        if ids.isEmpty || format.isEmpty || name.isEmpty {
            call.reject("Missing ids, format or name", "BAD_ARGUMENT")
            return
        }
        onCoreThread(call) { [self] in
            let file = shareDir.appendingPathComponent((name as NSString).lastPathComponent)
            try OpenDivesNative.exportDives(ids: numbers(ids), format: format, anonymize: anonymize, path: file.path)
            if call.getBool("text", false) {
                // The contents come back in the answer (the QR share): the file is not kept.
                let text = try String(contentsOf: file, encoding: .utf8)
                try? FileManager.default.removeItem(at: file)
                call.resolve(["uri": "", "text": text])
                return
            }
            call.resolve(["uri": file.absoluteString])
        }
    }

    /// A page of HTML (the dive sheet) rendered to a PDF in the temporary directory by
    /// an offscreen WKWebView, without network or dialog; US Letter or A4.
    @objc func htmlToPdf(_ call: CAPPluginCall) {
        guard let html = call.getString("html"), let name = call.getString("name"), !name.isEmpty else {
            call.reject("Missing html or name", "BAD_ARGUMENT")
            return
        }
        let letter = call.getBool("letter", false)
        DispatchQueue.main.async { [self] in
            var renderer: HtmlPdfRenderer?
            renderer = HtmlPdfRenderer(html: html, letter: letter) { [self] data in
                pdfRenderers.removeAll { $0 === renderer }
                guard let data else {
                    call.reject("Cannot render the PDF", "FAILED")
                    return
                }
                do {
                    let file = shareDir.appendingPathComponent((name as NSString).lastPathComponent)
                    try data.write(to: file)
                    call.resolve(["uri": file.absoluteString])
                } catch {
                    call.reject("Cannot render the PDF", "FAILED")
                }
            }
            if let renderer { pdfRenderers.append(renderer) }
        }
    }
}
