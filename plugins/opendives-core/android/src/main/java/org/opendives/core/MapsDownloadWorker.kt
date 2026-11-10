package org.opendives.core

import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.content.pm.ServiceInfo
import android.os.Build
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.work.ForegroundInfo
import androidx.work.Worker
import androidx.work.WorkerParameters
import java.io.File
import java.io.FileOutputStream
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.Callable
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicInteger
import java.util.concurrent.atomic.AtomicLong
import java.util.concurrent.atomic.AtomicReference

/**
 * Downloads the first region of the queue (MapsManager.head) tile by tile, with at most
 * MapsManager.MAX_PARALLEL requests at a time, skipping the tiles already on disk. It stops
 * at MapsManager.MAX_BYTES (error "limit", the tiles are removed). Runs as a foreground
 * service of type dataSync (the notification shows the title the screens gave and the
 * progress).
 */
class MapsDownloadWorker(context: Context, params: WorkerParameters) : Worker(context, params) {
    private sealed class Outcome {
        object Done : Outcome()
        object Stopped : Outcome()
        class Failed(val error: String) : Outcome()
    }

    override fun doWork(): Result {
        val manager = MapsManager
        manager.init(applicationContext)
        val head = manager.head() ?: return Result.success()
        if (!manager.networkAllows(head)) {
            // The network changed between the plan and now: the plan is made again.
            manager.schedule()
            return Result.success()
        }
        if (!manager.update(head.id, head.gen) { it.status = MapsManager.DOWNLOADING; it.error = null }) return Result.success()
        showNotification(head.title, head.tilesDone, head.tilesTotal, true)

        val outcome = try {
            download(head)
        } catch (e: IOException) {
            Log.w(TAG, "Map download interrupted: ${e.message}")
            if (isStopped) Outcome.Stopped else if (isSpaceError(e)) Outcome.Failed("space") else Outcome.Failed("network")
        } catch (e: Exception) {
            Log.e(TAG, "Map download failed", e)
            Outcome.Failed("network")
        }

        when (outcome) {
            is Outcome.Done -> Unit
            is Outcome.Stopped -> {
                // Stopped by the system (the network went away, a timeout) while still wanted: it waits and resumes.
                if (manager.isRunning(head.id, head.gen)) {
                    val state = if (manager.networkAllows(head)) MapsManager.QUEUED else MapsManager.WAITING_WIFI
                    manager.update(head.id, head.gen) { it.status = state }
                    return Result.retry()
                }
            }
            is Outcome.Failed -> {
                val lostWifi = outcome.error == "network" && !manager.networkAllows(head)
                if (lostWifi) {
                    // The network allowed by the diver went away: not an error, it resumes when it is back.
                    manager.update(head.id, head.gen) { it.status = MapsManager.WAITING_WIFI }
                    return Result.retry()
                }
                manager.update(head.id, head.gen) { it.status = MapsManager.FAILED; it.error = outcome.error }
            }
        }
        // The next region of the queue, if any (it may need another network).
        manager.schedule()
        return Result.success()
    }

    private fun download(e: MapsManager.Entry): Outcome {
        val manager = MapsManager
        val part = manager.partDir(e.id)
        part.mkdirs()
        if (manager.freeSpace().first < MapsManager.MAX_BYTES) return Outcome.Failed("space")

        val userAgent = manager.userAgent
        val tiles = MapsManager.tiles(MapsManager.tileRanges(e.bbox, e.maxZoom))
        val done = AtomicInteger(0)
        val received = AtomicLong(MapsManager.scan(part).second)
        val failure = AtomicReference<Outcome.Failed?>(null)
        val stopped = AtomicBoolean(false)
        val lastNotification = AtomicLong(0)

        fun nextTile(): IntArray? = synchronized(tiles) { if (tiles.hasNext()) tiles.next() else null }

        // A worker of the pool: takes tiles until none is left, or until something stops the download.
        val task = Callable {
            while (failure.get() == null) {
                if (isStopped || !manager.isRunning(e.id, e.gen)) {
                    stopped.set(true)
                    return@Callable
                }
                val (z, x, y) = nextTile()?.let { Triple(it[0], it[1], it[2]) } ?: return@Callable
                val file = MapsManager.tileFile(part, z, x, y)
                try {
                    if (!file.exists()) {
                        val bytes = fetch(MapsManager.tileUrl(e.urlTemplate, z, x, y), userAgent) ?: run { stopped.set(true); return@Callable }
                        file.parentFile!!.mkdirs()
                        val tmp = File(file.parentFile, "$y.tmp")
                        FileOutputStream(tmp).use { it.write(bytes) }
                        if (!tmp.renameTo(file)) throw IOException("Cannot store a tile")
                        if (received.addAndGet(bytes.size.toLong()) >= MapsManager.MAX_BYTES) {
                            failure.compareAndSet(null, Outcome.Failed("limit"))
                            return@Callable
                        }
                    }
                } catch (io: ServerError) {
                    failure.compareAndSet(null, Outcome.Failed("server"))
                    return@Callable
                } catch (io: IOException) {
                    failure.compareAndSet(null, Outcome.Failed(if (isSpaceError(io)) "space" else "network"))
                    return@Callable
                }
                val n = done.incrementAndGet()
                manager.progress(e.id, e.gen, n, received.get())
                val now = System.currentTimeMillis()
                if (now - lastNotification.get() > 1000) {
                    lastNotification.set(now)
                    showNotification(e.title, n, e.tilesTotal, false)
                }
            }
        }

        val pool = Executors.newFixedThreadPool(MapsManager.MAX_PARALLEL)
        try {
            pool.invokeAll(List(MapsManager.MAX_PARALLEL) { task })
        } finally {
            pool.shutdownNow()
        }

        failure.get()?.let {
            // Over the limit: nothing of the region is kept.
            if (it.error == "limit") part.deleteRecursively()
            return it
        }
        if (stopped.get() || isStopped) return Outcome.Stopped
        if (done.get() < e.tilesTotal) return Outcome.Failed("network")
        return if (manager.finish(e.id, e.gen)) Outcome.Done else Outcome.Stopped
    }

    private class ServerError(val retry: Boolean) : IOException("Tile server error")

    /**
     * One tile: its bytes, empty for a tile the server does not have (204, 404); null when the
     * download was stopped meanwhile. Retries a network error or a 429/5xx twice, then fails.
     */
    private fun fetch(url: String, userAgent: String): ByteArray? {
        var attempt = 0
        while (true) {
            if (isStopped) return null
            var failure: IOException
            val connection = URL(url).openConnection() as HttpURLConnection
            try {
                connection.connectTimeout = 20_000
                connection.readTimeout = 30_000
                connection.setRequestProperty("User-Agent", userAgent)
                val code = connection.responseCode
                if (code == 200) return connection.inputStream.use { it.readBytes() }
                if (code == 204 || code == 404) return ByteArray(0)
                failure = ServerError(code == 429 || code >= 500)
            } catch (io: IOException) {
                failure = io
            } finally {
                connection.disconnect()
            }
            if (isSpaceError(failure) || (failure is ServerError && !failure.retry) || attempt >= MAX_RETRIES) throw failure
            attempt++
            try {
                Thread.sleep(1000L * attempt)
            } catch (ie: InterruptedException) {
                return null
            }
        }
    }

    private fun isSpaceError(e: IOException): Boolean {
        val message = e.message.orEmpty()
        return message.contains("ENOSPC") || message.contains("No space left", ignoreCase = true)
    }

    // --- Foreground notification ---

    private fun notification(title: String, done: Int, total: Int, indeterminate: Boolean) =
        NotificationCompat.Builder(applicationContext, CHANNEL)
            .setContentTitle(title)
            .setSmallIcon(android.R.drawable.stat_sys_download)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setSilent(true)
            .setCategory(NotificationCompat.CATEGORY_PROGRESS)
            .setProgress(if (total > 0) 100 else 0, if (total > 0) (done.toLong() * 100 / total).toInt() else 0, indeterminate || total <= 0)
            .build()

    private fun ensureChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val notifications = applicationContext.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            if (notifications.getNotificationChannel(CHANNEL) == null) {
                notifications.createNotificationChannel(NotificationChannel(CHANNEL, applicationContext.getString(R.string.od_maps_channel), NotificationManager.IMPORTANCE_LOW))
            }
        }
    }

    private fun showNotification(title: String, done: Int, total: Int, first: Boolean) {
        ensureChannel()
        val notification = notification(title, done, total, first)
        if (first) {
            try {
                val type = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC else 0
                setForegroundAsync(ForegroundInfo(NOTIFICATION_ID, notification, type))
            } catch (e: Exception) {
                // Android 12+ refuses a foreground service started from the background in some cases:
                // the download goes on without it (the system may stop it, it resumes).
                Log.w(TAG, "No foreground service for the map download: ${e.message}")
            }
        } else {
            val notifications = applicationContext.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            try {
                notifications.notify(NOTIFICATION_ID, notification)
            } catch (e: SecurityException) {
                // notification permission refused: no notification, the download goes on
            }
        }
    }

    private companion object {
        const val TAG = "OpenDives"
        const val CHANNEL = "offline-maps"
        const val NOTIFICATION_ID = 4201
        const val MAX_RETRIES = 2
    }
}
