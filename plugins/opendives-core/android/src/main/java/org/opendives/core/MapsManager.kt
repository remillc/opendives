package org.opendives.core

import android.content.Context
import android.net.ConnectivityManager
import android.os.StatFs
import android.util.Log
import androidx.work.Constraints
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import kotlin.math.PI
import kotlin.math.floor
import kotlin.math.ln
import kotlin.math.tan

/**
 * Offline map regions: tiles fetched one by one from a tile server (OpenFreeMap), the list
 * of downloads, their state kept across restarts, and the files. The download itself is
 * MapsDownloadWorker.
 *
 * The limits that keep the app within the server's terms of use are enforced here, in native
 * code, whatever the web layer asks: MAX_TILES a region, MAX_BYTES a region, MAX_PARALLEL
 * requests at a time, a User-Agent that names the app.
 *
 * Tiles live in the app's no-backup storage, in `maps/`: `<id>/<z>/<x>/<y>` is a ready region
 * (plus `meta.json`), `_part_<id>/` the download in progress. A resume skips the tiles already
 * there. An update of a ready id downloads into `_part_<id>/` and swaps it in only once
 * complete, so the old tiles stay readable. A zero-length tile file is an empty tile.
 *
 * One download runs at a time, in the order of the requests. "Wi-Fi only" means an unmetered
 * network (the same rule as WorkManager's UNMETERED constraint, so the status shown and the
 * work scheduled agree).
 */
object MapsManager {
    private const val TAG = "OpenDives"
    private const val STATE_FILE = "maps-state.json"
    private const val WORK_NAME = "maps-download"
    private const val PARTIAL_MAX_AGE_MS = 7L * 24 * 3600 * 1000
    private const val PROGRESS_EVENT_MS = 500L
    private const val META = "meta.json"
    private const val PART_PREFIX = "_part_"
    private const val OLD_PREFIX = "_old_"
    private const val MAX_LATITUDE = 85.0511287798

    const val MAX_TILES = 3000
    const val MAX_BYTES = 50L * 1024 * 1024
    const val MAX_PARALLEL = 4
    const val REPO_URL = "https://github.com/remillc/opendives"

    val ID_PATTERN = Regex("[A-Za-z0-9][A-Za-z0-9._-]{0,127}")

    const val QUEUED = "queued"
    const val WAITING_WIFI = "waiting-wifi"
    const val DOWNLOADING = "downloading"
    const val PAUSED = "paused"
    const val FAILED = "failed"
    const val READY = "ready"

    /** One download. `gen` changes when the request for the id is replaced, so a running worker notices. */
    class Entry(
        val id: String,
        val bbox: DoubleArray, // west, south, east, north
        val maxZoom: Int,
        val urlTemplate: String,
        val version: String,
        var allowCellular: Boolean,
        var title: String,
        var status: String,
        var tilesDone: Int,
        var tilesTotal: Int,
        var bytesReceived: Long,
        var error: String?,
        var order: Long,
        var gen: Long,
    ) {
        fun copy() = Entry(
            id, bbox, maxZoom, urlTemplate, version, allowCellular, title, status,
            tilesDone, tilesTotal, bytesReceived, error, order, gen,
        )

        /** The MapDownload object of the JS contract. */
        fun toEvent(): JSONObject = JSONObject()
            .put("id", id).put("status", status)
            .put("tilesDone", tilesDone).put("tilesTotal", tilesTotal)
            .put("bytesReceived", bytesReceived)
            .also { if (error != null) it.put("error", error) }

        fun toState(): JSONObject = toEvent()
            .put("bbox", JSONArray(bbox.toList())).put("maxZoom", maxZoom)
            .put("urlTemplate", urlTemplate).put("version", version)
            .put("allowCellular", allowCellular).put("title", title)
            .put("order", order).put("gen", gen)

        companion object {
            fun fromState(o: JSONObject): Entry {
                val b = o.getJSONArray("bbox")
                return Entry(
                    o.getString("id"), DoubleArray(4) { b.getDouble(it) }, o.getInt("maxZoom"),
                    o.getString("urlTemplate"), o.optString("version"), o.optBoolean("allowCellular"),
                    o.optString("title"), o.getString("status"), o.optInt("tilesDone"), o.getInt("tilesTotal"),
                    o.optLong("bytesReceived"), o.optString("error").ifEmpty { null }, o.optLong("order"), o.optLong("gen"),
                )
            }
        }
    }

    private lateinit var appContext: Context
    private var loaded = false
    private val entries = LinkedHashMap<String, Entry>()
    private var nextOrder = 1L
    private var nextGen = 1L
    private var lastProgressEvent = 0L
    private var scheduled: Pair<String, Long>? = null

    /** Set by the plugin while it is alive: gets every status change and the progress. */
    @Volatile
    var listener: ((JSONObject) -> Unit)? = null

    val dir: File get() = File(appContext.noBackupFilesDir, "maps").also { it.mkdirs() }
    fun readyDir(id: String) = File(dir, id)
    fun partDir(id: String) = File(dir, "$PART_PREFIX$id")
    private fun oldDir(id: String) = File(dir, "$OLD_PREFIX$id")

    /** `OpenDives/<versionName> (dive log app; <repository>)`: no personal data. */
    val userAgent: String
        get() {
            val version = try {
                appContext.packageManager.getPackageInfo(appContext.packageName, 0).versionName
            } catch (e: Exception) {
                null
            }
            return "OpenDives/${version ?: "unknown"} (dive log app; $REPO_URL)"
        }

    // --- Tiles (Web Mercator, "slippy map" numbering) ---

    /** A block of tiles of one zoom: x in [x0, x1], y in [y0, y1]. */
    class TileRange(val z: Int, val x0: Int, val x1: Int, val y0: Int, val y1: Int) {
        val count: Long get() = (x1 - x0 + 1).toLong() * (y1 - y0 + 1)
    }

    private fun tileX(lon: Double, n: Int): Int = floor((lon + 180.0) / 360.0 * n).toInt().coerceIn(0, n - 1)

    private fun tileY(lat: Double, n: Int): Int {
        val r = Math.toRadians(lat.coerceIn(-MAX_LATITUDE, MAX_LATITUDE))
        return floor((1.0 - ln(tan(r) + 1.0 / Math.cos(r)) / PI) / 2.0 * n).toInt().coerceIn(0, n - 1)
    }

    /**
     * The tile blocks that cover [west, south, east, north] at zooms 0..maxZoom. West greater
     * than east means the rectangle crosses the antimeridian: two blocks per zoom (one when
     * they meet, as at low zooms, so no tile is counted twice).
     */
    fun tileRanges(bbox: DoubleArray, maxZoom: Int): List<TileRange> {
        val out = ArrayList<TileRange>()
        for (z in 0..maxZoom) {
            val n = 1 shl z
            val xw = tileX(bbox[0], n)
            val xe = tileX(bbox[2], n)
            val yn = tileY(bbox[3], n)
            val ys = tileY(bbox[1], n)
            if (bbox[0] <= bbox[2]) {
                out.add(TileRange(z, xw, xe, yn, ys))
            } else if (xw <= xe + 1) {
                out.add(TileRange(z, 0, n - 1, yn, ys))
            } else {
                out.add(TileRange(z, xw, n - 1, yn, ys))
                out.add(TileRange(z, 0, xe, yn, ys))
            }
        }
        return out
    }

    fun countTiles(bbox: DoubleArray, maxZoom: Int): Long = tileRanges(bbox, maxZoom).sumOf { it.count }

    /** Every tile of the ranges as (z, x, y), lowest zoom first. */
    fun tiles(ranges: List<TileRange>): Iterator<IntArray> = sequence {
        for (r in ranges) for (x in r.x0..r.x1) for (y in r.y0..r.y1) yield(intArrayOf(r.z, x, y))
    }.iterator()

    fun tileUrl(template: String, z: Int, x: Int, y: Int): String =
        template.replace("{z}", z.toString()).replace("{x}", x.toString()).replace("{y}", y.toString())

    fun tileFile(root: File, z: Int, x: Int, y: Int) = File(root, "$z/$x/$y")

    /** Bytes of a ready tile; null when the region or the tile is absent, empty for an empty tile. */
    fun readTile(id: String, z: Int, x: Int, y: Int): ByteArray? {
        val f = tileFile(readyDir(id), z, x, y)
        return if (f.isFile) f.readBytes() else null
    }

    /** Number and total size of the finished tile files of a directory (temporary files are ignored). */
    fun scan(root: File): Pair<Int, Long> {
        var count = 0
        var bytes = 0L
        for (zDir in root.listFiles().orEmpty()) {
            if (!zDir.isDirectory) continue
            for (xDir in zDir.listFiles().orEmpty()) {
                if (!xDir.isDirectory) continue
                for (f in xDir.listFiles().orEmpty()) {
                    if (f.isFile && f.name.all { it.isDigit() }) {
                        count++
                        bytes += f.length()
                    }
                }
            }
        }
        return count to bytes
    }

    // --- State ---

    @Synchronized
    fun init(context: Context) {
        if (loaded) return
        appContext = context.applicationContext
        loaded = true
        // Files of the previous design (one package file a region) are of no use any more.
        for (f in dir.listFiles().orEmpty()) {
            if (f.isFile && (f.name.endsWith(".pmtiles") || f.name.endsWith(".part"))) f.delete()
        }
        // A swap interrupted between its two renames: the old tiles come back.
        for (f in dir.listFiles().orEmpty()) {
            if (f.isDirectory && f.name.startsWith(OLD_PREFIX)) {
                val ready = readyDir(f.name.removePrefix(OLD_PREFIX))
                if (ready.exists()) f.deleteRecursively() else f.renameTo(ready)
            }
        }
        try {
            val stateFile = File(appContext.noBackupFilesDir, STATE_FILE)
            if (stateFile.exists()) {
                val array = JSONArray(stateFile.readText())
                for (i in 0 until array.length()) {
                    try {
                        val e = Entry.fromState(array.getJSONObject(i))
                        entries[e.id] = e
                        nextOrder = maxOf(nextOrder, e.order + 1)
                        nextGen = maxOf(nextGen, e.gen + 1)
                    } catch (ex: Exception) {
                        // An entry of the previous design, or a damaged one: dropped.
                    }
                }
            }
        } catch (ex: Exception) {
            Log.e(TAG, "Cannot read the maps state", ex)
        }
        // Partial downloads abandoned for more than 7 days go; their entries with them.
        val limit = System.currentTimeMillis() - PARTIAL_MAX_AGE_MS
        for (f in dir.listFiles().orEmpty()) {
            if (f.isDirectory && f.name.startsWith(PART_PREFIX) && f.lastModified() < limit) {
                f.deleteRecursively()
                val id = f.name.removePrefix(PART_PREFIX)
                if (entries[id]?.status != READY) entries.remove(id)
            }
        }
        // Part directories nobody asks for.
        for (f in dir.listFiles().orEmpty()) {
            if (f.isDirectory && f.name.startsWith(PART_PREFIX) && entries[f.name.removePrefix(PART_PREFIX)]?.status.let { it == null || it == READY }) {
                f.deleteRecursively()
            }
        }
        // Ready regions on disk are the truth for the ready entries.
        for (f in dir.listFiles().orEmpty()) {
            if (f.isDirectory && !f.name.startsWith("_") && !entries.containsKey(f.name)) {
                readyEntry(f.name)?.let { entries[it.id] = it }
            }
        }
        val it = entries.values.iterator()
        while (it.hasNext()) {
            val e = it.next()
            when (e.status) {
                READY -> if (!File(readyDir(e.id), META).exists()) it.remove()
                // The process died during the download (or while it waited): it goes back in the queue.
                DOWNLOADING, WAITING_WIFI -> e.status = QUEUED
            }
            if (e.status == QUEUED || e.status == PAUSED || e.status == FAILED) rescan(e)
        }
        save()
        schedule()
    }

    private fun rescan(e: Entry) {
        val (count, bytes) = scan(partDir(e.id))
        e.tilesDone = count
        e.bytesReceived = bytes
    }

    /** The entry of a ready region, rebuilt from its meta file; null when it has none. */
    private fun readyEntry(id: String): Entry? = try {
        File(readyDir(id), META).takeIf { it.exists() }?.let { Entry.fromState(JSONObject(it.readText())).also { e -> e.status = READY; e.error = null } }
    } catch (ex: Exception) {
        null
    }

    private fun save() {
        try {
            val array = JSONArray()
            for (e in entries.values) array.put(e.toState())
            val file = File(appContext.noBackupFilesDir, STATE_FILE)
            val tmp = File(appContext.noBackupFilesDir, "$STATE_FILE.tmp")
            tmp.writeText(array.toString())
            if (!tmp.renameTo(file)) {
                file.delete()
                tmp.renameTo(file)
            }
        } catch (ex: Exception) {
            Log.e(TAG, "Cannot save the maps state", ex)
        }
    }

    // --- Requests from the plugin ---

    @Synchronized
    fun downloads(): List<Entry> = entries.values.map { it.copy() }

    /**
     * Validates a request; the error code to reject with, or null when it is acceptable.
     * BAD_ARGUMENT for a malformed request, TOO_MANY_TILES above MAX_TILES.
     */
    fun check(bbox: DoubleArray?, maxZoom: Int, urlTemplate: String?): String? {
        if (bbox == null || bbox.size != 4 || bbox.any { !it.isFinite() }) return "BAD_ARGUMENT"
        if (bbox[0] < -180 || bbox[0] > 180 || bbox[2] < -180 || bbox[2] > 180 || bbox[1] < -90 || bbox[3] > 90 || bbox[1] > bbox[3]) return "BAD_ARGUMENT"
        if (maxZoom != 12 && maxZoom != 14) return "BAD_ARGUMENT"
        if (urlTemplate == null || !urlTemplate.startsWith("https://") ||
            !urlTemplate.contains("{z}") || !urlTemplate.contains("{x}") || !urlTemplate.contains("{y}")
        ) return "BAD_ARGUMENT"
        if (countTiles(bbox, maxZoom) > MAX_TILES) return "TOO_MANY_TILES"
        return null
    }

    /** Queues a region (already checked). Nothing happens if the same region is already ready. */
    fun start(id: String, bbox: DoubleArray, maxZoom: Int, urlTemplate: String, version: String, allowCellular: Boolean, title: String) {
        val changed: Entry
        val total = countTiles(bbox, maxZoom).toInt()
        synchronized(this) {
            val old = entries[id]
            val same = old != null && old.bbox.contentEquals(bbox) && old.maxZoom == maxZoom &&
                old.urlTemplate == urlTemplate && old.version == version
            if (same && old!!.status == READY) return // already up to date
            // The same request again (a restart of the screen): the tiles already there are kept.
            if (!same) partDir(id).deleteRecursively()
            val e = Entry(id, bbox, maxZoom, urlTemplate, version, allowCellular, title, QUEUED, 0, total, 0, null, nextOrder++, nextGen++)
            if (same) rescan(e)
            entries.remove(id) // goes to the end of the queue
            entries[id] = e
            save()
            changed = e.copy()
        }
        emit(changed)
        schedule()
    }

    fun pause(id: String) = change(id) { e -> if (e.status != READY && e.status != FAILED) e.status = PAUSED }

    fun resume(id: String, allowCellular: Boolean) = change(id) { e ->
        if (e.status != READY) {
            e.allowCellular = allowCellular
            e.status = QUEUED
            e.error = null
            e.order = nextOrder++
        }
    }

    fun cancel(id: String) {
        val restored: Entry?
        synchronized(this) {
            val e = entries[id] ?: return
            if (e.status == READY) return
            entries.remove(id)
            partDir(id).deleteRecursively()
            // The old tiles of an update stay: the region keeps its place.
            restored = readyEntry(id)?.also { entries[id] = it }
            save()
        }
        if (restored != null) emit(restored.copy())
        schedule()
    }

    fun delete(id: String) {
        synchronized(this) {
            entries.remove(id)
            partDir(id).deleteRecursively()
            readyDir(id).deleteRecursively()
            save()
        }
        schedule()
    }

    private fun change(id: String, block: (Entry) -> Unit) {
        val changed: Entry
        synchronized(this) {
            val e = entries[id] ?: return
            block(e)
            if (e.status == PAUSED || e.status == QUEUED) rescan(e)
            save()
            changed = e.copy()
        }
        emit(changed)
        schedule()
    }

    /** Ready regions: id, size in bytes, version, maxZoom. */
    class ReadyRegion(val id: String, val sizeBytes: Long, val version: String, val maxZoom: Int)

    fun files(): List<ReadyRegion> = dir.listFiles().orEmpty()
        .filter { it.isDirectory && !it.name.startsWith("_") }
        .mapNotNull { d -> readyEntry(d.name)?.let { ReadyRegion(it.id, it.bytesReceived, it.version, it.maxZoom) } }

    fun freeSpace(): Pair<Long, Long> {
        val stat = StatFs(appContext.noBackupFilesDir.absolutePath)
        return stat.availableBytes to stat.totalBytes
    }

    // --- Used by the worker ---

    /** The download to run now: the first in the queue. */
    @Synchronized
    fun head(): Entry? = entries.values.filter { it.status == QUEUED || it.status == WAITING_WIFI || it.status == DOWNLOADING }
        .minByOrNull { it.order }?.copy()

    /** Whether the download `gen` of `id` is still the one that should run. */
    @Synchronized
    fun isRunning(id: String, gen: Long): Boolean = entries[id].let { it != null && it.gen == gen && it.status == DOWNLOADING }

    /** Changes the entry if it is still the same request; returns false when it was replaced, paused or cancelled. */
    fun update(id: String, gen: Long, block: (Entry) -> Unit): Boolean {
        val changed: Entry
        synchronized(this) {
            val e = entries[id] ?: return false
            if (e.gen != gen) return false
            block(e)
            save()
            changed = e.copy()
        }
        emit(changed)
        return true
    }

    /** Progress in memory only (the part directory is the truth after a restart); an event at most every 500 ms. */
    fun progress(id: String, gen: Long, tilesDone: Int, bytes: Long) {
        val event: JSONObject
        synchronized(this) {
            val e = entries[id] ?: return
            if (e.gen != gen) return
            e.tilesDone = tilesDone
            e.bytesReceived = bytes
            val now = System.currentTimeMillis()
            if (now - lastProgressEvent < PROGRESS_EVENT_MS) return
            lastProgressEvent = now
            event = e.toEvent()
        }
        partDir(id).setLastModified(System.currentTimeMillis())
        listener?.invoke(event)
    }

    /** A complete region: the part directory replaces the old tiles. */
    fun finish(id: String, gen: Long): Boolean {
        synchronized(this) {
            val e = entries[id] ?: return false
            if (e.gen != gen) return false
            val part = partDir(id)
            val (count, bytes) = scan(part)
            e.tilesDone = count
            e.bytesReceived = bytes
            e.status = READY
            e.error = null
            try {
                File(part, META).writeText(e.toState().toString())
            } catch (ex: Exception) {
                Log.e(TAG, "Cannot write the region's meta file", ex)
                return false
            }
            val ready = readyDir(id)
            val old = oldDir(id)
            old.deleteRecursively()
            if (ready.exists() && !ready.renameTo(old)) return false
            if (!part.renameTo(ready)) {
                if (old.exists()) old.renameTo(ready)
                return false
            }
            old.deleteRecursively()
        }
        return update(id, gen) { }
    }

    private fun emit(e: Entry) {
        listener?.invoke(e.toEvent())
    }

    fun isUnmetered(): Boolean {
        val manager = appContext.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
        val capabilities = manager.getNetworkCapabilities(manager.activeNetwork) ?: return false
        return capabilities.hasCapability(android.net.NetworkCapabilities.NET_CAPABILITY_NOT_METERED)
    }

    fun isConnected(): Boolean {
        val manager = appContext.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
        return manager.getNetworkCapabilities(manager.activeNetwork) != null
    }

    /** Whether the network now lets this download run. */
    fun networkAllows(e: Entry): Boolean = if (e.allowCellular) isConnected() else isUnmetered()

    /**
     * (Re)plans the work for the first download of the queue, with the network
     * it needs. Replacing the work stops a running one, which resumes from its
     * part directory.
     */
    fun schedule() {
        val head = head()
        // The download in progress goes on when the queue changes behind it.
        if (head != null && head.status == DOWNLOADING && scheduled == head.id to head.gen) return
        scheduled = head?.let { it.id to it.gen }
        val manager = WorkManager.getInstance(appContext)
        if (head == null) {
            manager.cancelUniqueWork(WORK_NAME)
            return
        }
        // Waiting for Wi-Fi is a status of its own, set here and cleared when the network allows.
        val wanted = if (head.status != DOWNLOADING && !networkAllows(head)) WAITING_WIFI else if (head.status == WAITING_WIFI) QUEUED else head.status
        if (wanted != head.status) update(head.id, head.gen) { it.status = wanted }
        val constraints = Constraints.Builder()
            .setRequiredNetworkType(if (head.allowCellular) NetworkType.CONNECTED else NetworkType.UNMETERED)
            .build()
        val request = OneTimeWorkRequestBuilder<MapsDownloadWorker>().setConstraints(constraints).build()
        manager.enqueueUniqueWork(WORK_NAME, ExistingWorkPolicy.REPLACE, request)
    }
}
