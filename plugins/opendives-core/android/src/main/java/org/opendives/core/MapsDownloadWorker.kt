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
import java.security.MessageDigest

/**
 * Downloads the first package of the queue (MapsManager.head), resuming a
 * partial file with an HTTP Range request, checks its SHA-256, and makes it
 * ready. Runs as a foreground service of type dataSync (the notification
 * shows the title the screens gave and the progress).
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
        showNotification(head.title, head.bytesReceived, head.sizeBytes, true)

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
        // The next package of the queue, if any (it may need another network).
        manager.schedule()
        return Result.success()
    }

    private fun download(e: MapsManager.Entry): Outcome {
        val manager = MapsManager
        val part = manager.partFile(e.id)
        var offset = part.length()
        if (e.sizeBytes > 0 && offset > e.sizeBytes) {
            part.delete()
            offset = 0
        }
        if (e.sizeBytes > 0 && manager.freeSpace().first < e.sizeBytes - offset) return Outcome.Failed("space")

        var total = e.sizeBytes
        var retriedFromStart = false
        while (true) {
            val connection = URL(e.url).openConnection() as HttpURLConnection
            try {
                connection.connectTimeout = 20_000
                connection.readTimeout = 30_000
                connection.setRequestProperty("Accept-Encoding", "identity")
                if (offset > 0) connection.setRequestProperty("Range", "bytes=$offset-")
                val code = connection.responseCode
                var append = true
                when {
                    code == 206 -> {
                        // "bytes 100-999/1000"
                        connection.getHeaderField("Content-Range")?.substringAfter('/')?.toLongOrNull()?.let { total = it }
                    }
                    code == 200 -> {
                        // The server ignores Range: from the start.
                        if (offset > 0) {
                            offset = 0
                            append = false
                        }
                        if (connection.contentLengthLong > 0) total = connection.contentLengthLong
                    }
                    code == 416 && offset > 0 && !retriedFromStart -> {
                        part.delete()
                        offset = 0
                        retriedFromStart = true
                        continue
                    }
                    else -> return Outcome.Failed("server")
                }
                if (!manager.update(e.id, e.gen) { it.totalBytes = total; it.bytesReceived = offset }) return Outcome.Stopped
                if (total > 0 && manager.freeSpace().first < total - offset) return Outcome.Failed("space")

                val buffer = ByteArray(64 * 1024)
                var lastNotification = 0L
                connection.inputStream.use { input ->
                    FileOutputStream(part, append).use { out ->
                        while (true) {
                            if (isStopped || !manager.isRunning(e.id, e.gen)) return Outcome.Stopped
                            val n = input.read(buffer)
                            if (n < 0) break
                            try {
                                out.write(buffer, 0, n)
                            } catch (io: IOException) {
                                if (isSpaceError(io)) return Outcome.Failed("space")
                                throw io
                            }
                            offset += n
                            manager.progress(e.id, e.gen, offset, total)
                            val now = System.currentTimeMillis()
                            if (now - lastNotification > 1000) {
                                lastNotification = now
                                showNotification(e.title, offset, total, false)
                            }
                        }
                    }
                }
                if (total > 0 && offset < total) return Outcome.Failed("network") // the connection ended early
                break
            } finally {
                connection.disconnect()
            }
        }

        // Checked before it becomes ready; a wrong file is not kept.
        if (!sha256(part).equals(e.sha256, ignoreCase = true)) {
            part.delete()
            return Outcome.Failed("checksum")
        }
        return if (manager.finish(e.id, e.gen)) Outcome.Done else Outcome.Stopped
    }

    private fun sha256(file: File): String {
        val digest = MessageDigest.getInstance("SHA-256")
        val buffer = ByteArray(256 * 1024)
        file.inputStream().use { input ->
            while (true) {
                if (isStopped) throw IOException("stopped")
                val n = input.read(buffer)
                if (n < 0) break
                digest.update(buffer, 0, n)
            }
        }
        return digest.digest().joinToString("") { "%02x".format(it) }
    }

    private fun isSpaceError(e: IOException): Boolean {
        val message = e.message.orEmpty()
        return message.contains("ENOSPC") || message.contains("No space left", ignoreCase = true)
    }

    // --- Foreground notification ---

    private fun notification(title: String, received: Long, total: Long, indeterminate: Boolean) =
        NotificationCompat.Builder(applicationContext, CHANNEL)
            .setContentTitle(title)
            .setSmallIcon(android.R.drawable.stat_sys_download)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setSilent(true)
            .setCategory(NotificationCompat.CATEGORY_PROGRESS)
            .setProgress(if (total > 0) 100 else 0, if (total > 0) (received * 100 / total).toInt() else 0, indeterminate || total <= 0)
            .build()

    private fun ensureChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val notifications = applicationContext.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            if (notifications.getNotificationChannel(CHANNEL) == null) {
                notifications.createNotificationChannel(NotificationChannel(CHANNEL, "Offline maps", NotificationManager.IMPORTANCE_LOW))
            }
        }
    }

    private fun showNotification(title: String, received: Long, total: Long, first: Boolean) {
        ensureChannel()
        val notification = notification(title, received, total, first)
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
    }
}
