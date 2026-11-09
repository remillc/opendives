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
import java.io.RandomAccessFile

/**
 * Offline map packages (PMTiles files): the list of downloads, their state kept
 * across restarts, and the files. The download itself is MapsDownloadWorker.
 *
 * Files live in the app's no-backup storage, in `maps/`: `<id>.pmtiles` is a
 * ready package, `<id>.part` the download in progress (resumed with HTTP
 * Range). An update of a ready id downloads into `.part` and replaces the old
 * file only once the new one is checked, so the old package stays usable.
 *
 * One download runs at a time, in the order of the requests. "Wi-Fi only" means
 * an unmetered network (the same rule as WorkManager's UNMETERED constraint, so
 * the status shown and the work scheduled agree).
 */
object MapsManager {
    private const val TAG = "OpenDives"
    private const val STATE_FILE = "maps-state.json"
    private const val WORK_NAME = "maps-download"
    private const val PARTIAL_MAX_AGE_MS = 7L * 24 * 3600 * 1000
    private const val PROGRESS_EVENT_MS = 500L
    const val MAX_READ_BYTES = 16 * 1024 * 1024

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
        var url: String,
        var sha256: String,
        var sizeBytes: Long,
        var allowCellular: Boolean,
        var title: String,
        var status: String,
        var bytesReceived: Long,
        var totalBytes: Long,
        var error: String?,
        var order: Long,
        var gen: Long,
    ) {
        fun copy() = Entry(id, url, sha256, sizeBytes, allowCellular, title, status, bytesReceived, totalBytes, error, order, gen)

        /** The MapDownload object of the JS contract. */
        fun toEvent(): JSONObject = JSONObject()
            .put("id", id).put("status", status)
            .put("bytesReceived", bytesReceived).put("totalBytes", totalBytes)
            .also { if (error != null) it.put("error", error) }

        fun toState(): JSONObject = toEvent()
            .put("url", url).put("sha256", sha256).put("sizeBytes", sizeBytes)
            .put("allowCellular", allowCellular).put("title", title)
            .put("order", order).put("gen", gen)
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
    fun readyFile(id: String) = File(dir, "$id.pmtiles")
    fun partFile(id: String) = File(dir, "$id.part")

    @Synchronized
    fun init(context: Context) {
        if (loaded) return
        appContext = context.applicationContext
        loaded = true
        try {
            val stateFile = File(appContext.noBackupFilesDir, STATE_FILE)
            if (stateFile.exists()) {
                val array = JSONArray(stateFile.readText())
                for (i in 0 until array.length()) {
                    val o = array.getJSONObject(i)
                    val e = Entry(
                        o.getString("id"), o.getString("url"), o.getString("sha256"), o.getLong("sizeBytes"),
                        o.getBoolean("allowCellular"), o.optString("title"), o.getString("status"),
                        o.optLong("bytesReceived"), o.optLong("totalBytes"), o.optString("error").ifEmpty { null },
                        o.optLong("order"), o.optLong("gen"),
                    )
                    entries[e.id] = e
                    nextOrder = maxOf(nextOrder, e.order + 1)
                    nextGen = maxOf(nextGen, e.gen + 1)
                }
            }
        } catch (ex: Exception) {
            Log.e(TAG, "Cannot read the maps state", ex)
        }
        // Partial files abandoned for more than 7 days go; their entries with them.
        val limit = System.currentTimeMillis() - PARTIAL_MAX_AGE_MS
        for (f in dir.listFiles().orEmpty()) {
            if (f.name.endsWith(".part") && f.lastModified() < limit) {
                f.delete()
                val e = entries[f.name.removeSuffix(".part")]
                if (e != null && e.status != READY) entries.remove(e.id)
            }
        }
        val it = entries.values.iterator()
        while (it.hasNext()) {
            val e = it.next()
            when (e.status) {
                READY -> if (!readyFile(e.id).exists()) it.remove()
                // The process died during the download (or while it waited): it goes back in the queue.
                DOWNLOADING, WAITING_WIFI -> e.status = QUEUED
            }
            if (e.status == QUEUED || e.status == PAUSED || e.status == FAILED) e.bytesReceived = partFile(e.id).length()
        }
        save()
        schedule()
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

    fun start(id: String, url: String, sha256: String, sizeBytes: Long, allowCellular: Boolean, title: String) {
        val changed: Entry
        synchronized(this) {
            val old = entries[id]
            // The same request again (a restart of the screen): the partial file is kept.
            val keep = old != null && old.url == url && old.sha256.equals(sha256, true)
            if (!keep) partFile(id).delete()
            val e = Entry(
                id, url, sha256, sizeBytes, allowCellular, title, QUEUED, if (keep) partFile(id).length() else 0, sizeBytes, null,
                nextOrder++, nextGen++,
            )
            if (old != null && keep && old.status == READY) {
                // Already up to date: nothing to download.
                return
            }
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
        val removed: Entry?
        synchronized(this) {
            val e = entries[id] ?: return
            if (e.status == READY) return
            removed = entries.remove(id)
            partFile(id).delete()
            save()
        }
        // The old ready file of an update stays: the package keeps its place.
        if (removed != null && readyFile(id).exists()) emit(removed.copy().also { c -> c.status = READY; c.error = null })
        schedule()
    }

    fun delete(id: String) {
        synchronized(this) {
            entries.remove(id)
            partFile(id).delete()
            readyFile(id).delete()
            save()
        }
        schedule()
    }

    private fun change(id: String, block: (Entry) -> Unit) {
        val changed: Entry
        synchronized(this) {
            val e = entries[id] ?: return
            block(e)
            if (e.status == PAUSED || e.status == QUEUED) e.bytesReceived = partFile(id).length()
            save()
            changed = e.copy()
        }
        emit(changed)
        schedule()
    }

    fun files(): List<Pair<String, Long>> =
        dir.listFiles().orEmpty().filter { it.name.endsWith(".pmtiles") }.map { it.name.removeSuffix(".pmtiles") to it.length() }

    fun freeSpace(): Pair<Long, Long> {
        val stat = StatFs(appContext.noBackupFilesDir.absolutePath)
        return stat.availableBytes to stat.totalBytes
    }

    fun readRange(id: String, offset: Long, length: Int): ByteArray {
        RandomAccessFile(readyFile(id), "r").use { f ->
            val size = f.length()
            if (offset < 0 || offset > size) return ByteArray(0)
            val n = minOf(length.toLong(), size - offset).toInt()
            val buffer = ByteArray(n)
            f.seek(offset)
            f.readFully(buffer)
            return buffer
        }
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

    /** Progress in memory only (the partial file is the truth after a restart); an event at most every 500 ms. */
    fun progress(id: String, gen: Long, received: Long, total: Long) {
        val event: JSONObject
        synchronized(this) {
            val e = entries[id] ?: return
            if (e.gen != gen) return
            e.bytesReceived = received
            if (total > 0) e.totalBytes = total
            val now = System.currentTimeMillis()
            if (now - lastProgressEvent < PROGRESS_EVENT_MS) return
            lastProgressEvent = now
            event = e.toEvent()
        }
        listener?.invoke(event)
    }

    /** A finished package: the checked `.part` replaces the old file. */
    fun finish(id: String, gen: Long): Boolean {
        synchronized(this) {
            val e = entries[id] ?: return false
            if (e.gen != gen) return false
            val target = readyFile(id)
            val part = partFile(id)
            if (!part.renameTo(target)) {
                target.delete()
                if (!part.renameTo(target)) return false
            }
        }
        return update(id, gen) { e ->
            e.status = READY
            e.error = null
            e.bytesReceived = readyFile(id).length()
            e.totalBytes = e.bytesReceived
        }
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
     * partial file.
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
