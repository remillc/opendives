// SPDX-License-Identifier: GPL-2.0
package org.opendives.core

import android.util.Base64
import android.util.Log
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import java.io.File
import java.security.KeyStore
import java.security.cert.X509Certificate
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors

@CapacitorPlugin(name = "OpenDivesCore")
class OpenDivesCorePlugin : Plugin() {
    private val coreThread: ExecutorService = Executors.newSingleThreadExecutor()

    /** Network only (probeCloud): runs while the core thread loads the log. */
    private val networkThread: ExecutorService = Executors.newSingleThreadExecutor()
    private val repoDir: File by lazy { File(context.filesDir, "carnet") }
    private val repo: String by lazy { "${repoDir.absolutePath}[main]" }

    override fun load() {
        val home = context.filesDir.absolutePath
        val caFile = File(context.cacheDir, "cacerts.pem")
        coreThread.execute {
            NativeCore.init(home)
            try {
                val count = exportSystemCertificates(caFile)
                NativeCore.setCaFile(caFile.absolutePath)
                Log.i(TAG, "$count system certificate authorities exported")
            } catch (e: Exception) {
                Log.e(TAG, "Cannot export the certificate authorities", e)
            }
            try {
                // Copied once per app version: the core reads it as a file.
                val regions = File(context.filesDir, REGIONS_ASSET)
                val version = context.packageManager.getPackageInfo(context.packageName, 0).lastUpdateTime
                if (!regions.exists() || regions.lastModified() < version) {
                    context.assets.open(REGIONS_ASSET).use { input -> regions.outputStream().use { input.copyTo(it) } }
                }
                NativeCore.setRegionsFile(regions.absolutePath)
            } catch (e: Exception) {
                Log.e(TAG, "Cannot install the offline regions", e)
            }
        }
    }

    @PluginMethod
    fun importSample(call: PluginCall) = onCoreThread(call) {
        val sample = File(context.cacheDir, SAMPLE_ASSET)
        context.assets.open(SAMPLE_ASSET).use { input ->
            sample.outputStream().use { output -> input.copyTo(output) }
        }
        val count = NativeCore.importFile(sample.absolutePath, repo)
        sample.delete()
        Log.i(TAG, "importSample: $count dives saved to $repo")
        call.resolve(JSObject().put("count", count))
    }

    /**
     * The JSON made by the core is passed on as a string and parsed once, in
     * JavaScript: parsing it into JSObject here, then serialising it again
     * for the bridge, took a large part of the loading time.
     */
    @PluginMethod
    fun listDives(call: PluginCall) = onCoreThread(call) {
        val start = System.currentTimeMillis()
        val exists = NativeCore.logExists(repo)
        val json = if (exists) NativeCore.listDives(repo) else "[]"
        Log.i(TAG, "listDives: exists=$exists, ${json.length} chars from $repo, ${System.currentTimeMillis() - start} ms")
        call.resolve(JSObject().put("exists", exists).put("json", json))
    }

    /** Detail of one dive of the loaded log; `id` comes from listDives or listCloudDives. */
    @PluginMethod
    fun getDive(call: PluginCall) = onCoreThread(call) {
        val id = call.getInt("id")
        if (id == null) {
            call.reject("Missing dive id", "BAD_ARGUMENT")
            return@onCoreThread
        }
        call.resolve(JSObject(NativeCore.getDive(id)))
    }

    /** The core's preferences shown in Settings (see get_prefs in opendives.h). */
    @PluginMethod
    fun getPrefs(call: PluginCall) = onCoreThread(call) {
        call.resolve(JSObject().put("json", NativeCore.getPrefs()))
    }

    /** Sets core preferences; `changes` is the flat JSON object of set_prefs(). */
    @PluginMethod
    fun setPrefs(call: PluginCall) = onCoreThread(call) {
        val changes = call.getObject("changes")
        if (changes == null) {
            call.reject("Missing changes", "BAD_ARGUMENT")
            return@onCoreThread
        }
        NativeCore.setPrefs(changes.toString())
        call.resolve()
    }

    /** Cylinder types of Settings: list, library, add, size, remove, rename (see opendives.h). */
    @PluginMethod
    fun cylinderTypes(call: PluginCall) = onCoreThread(call) {
        val json = NativeCore.cylinderTypes(
            call.getString("action").orEmpty(),
            call.getString("name").orEmpty(),
            call.getString("value").orEmpty(),
            call.getInt("ml") ?: 0,
            call.getInt("mbar") ?: 0,
        )
        call.resolve(JSObject().put("json", json))
    }


    /**
     * Read-only access to the Subsurface cloud. TEMPORARY, for development:
     * the credentials are read from files/cloud-dev.env, copied with adb
     * (see app/README.md). They are neither in the APK nor logged.
     *
     * configureCloud() sets the account, without network. Then probeCloud()
     * (server's head, network only) and listCloudDives({cached: true}) (the
     * device's copy, no network) can run at the same time.
     */
    @PluginMethod
    fun configureCloud(call: PluginCall) = onCoreThread(call) {
        val credentials = readDevCredentials()
        if (credentials != null) NativeCore.cloudConfigure(credentials.first, credentials.second)
        // Write lock (docs/editing-and-sync-plan.md, section 4): writing to the
        // cloud is allowed only for the test account named in files/cloud-test.env.
        NativeCore.setCloudTestEmail(readTestEmail())
        // The account email is shown on the Account screen; the password never leaves the plugin.
        call.resolve(JSObject().put("available", credentials != null).put("email", credentials?.first ?: ""))
    }

    @PluginMethod
    fun probeCloud(call: PluginCall) {
        networkThread.execute {
            try {
                val start = System.currentTimeMillis()
                val json = NativeCore.cloudProbe()
                val steps = JSObject(json)
                Log.i(
                    TAG,
                    "probeCloud: ${System.currentTimeMillis() - start} ms " +
                        "(connect ${steps.optLong("connectMs")} ms, list ${steps.optLong("listMs")} ms)",
                )
                call.resolve(JSObject().put("json", json))
            } catch (e: Exception) {
                Log.e(TAG, "Cloud probe error", e)
                call.reject(e.message, "CORE_ERROR", e)
            }
        }
    }

    /**
     * `cached: true` reads the device's copy only, without network (after
     * configureCloud); `json` is then empty when there is no copy yet.
     * Otherwise syncs with the server, then reads the log.
     */
    @PluginMethod
    fun listCloudDives(call: PluginCall) = onCoreThread(call) {
        val cached = call.getBoolean("cached", false) == true
        val start = System.currentTimeMillis()
        val json = if (cached) {
            NativeCore.cloudListCachedDives()
        } else {
            val credentials = readDevCredentials()
            if (credentials == null) {
                call.resolve(JSObject().put("available", false))
                return@onCoreThread
            }
            NativeCore.cloudListDives(credentials.first, credentials.second)
        }
        Log.i(TAG, "listCloudDives(cached=$cached): ${json.length} chars, ${System.currentTimeMillis() - start} ms")
        call.resolve(JSObject().put("available", true).put("json", json))
    }

    /** Local commits of the loaded cloud log not yet on the server (manual synchronisation). */
    @PluginMethod
    fun pendingChanges(call: PluginCall) = onCoreThread(call) {
        call.resolve(JSObject().put("json", NativeCore.pendingChanges()))
    }

    /**
     * Signs out: the core closes the log and forgets the account (and deletes
     * the device copy when asked, never with changes not sent), then the
     * stored credentials are forgotten. For now they are the development file;
     * the Android keystore comes with the sign-in screen.
     */
    @PluginMethod
    fun signOut(call: PluginCall) = onCoreThread(call) {
        NativeCore.cloudSignOut(call.getBoolean("deleteCopy", false) == true)
        File(context.filesDir, DEV_CREDENTIALS).delete()
        Log.i(TAG, "signOut: credentials forgotten")
        call.resolve()
    }

    /**
     * Deletes the cloud account (see opendives.h). With keepDives, the dives
     * are first saved as a new log without account; once the server confirms,
     * it becomes the device's log and the previous one is kept aside, renamed.
     * The password is never logged.
     */
    @PluginMethod
    fun deleteAccount(call: PluginCall) = onCoreThread(call) {
        val password = call.getString("password").orEmpty()
        val keepDives = call.getBoolean("keepDives", true) == true
        val kept = File(context.filesDir, "carnet.new")
        if (kept.exists()) kept.deleteRecursively() // left by an earlier attempt
        val json = NativeCore.cloudDeleteAccount(password, if (keepDives) "${kept.absolutePath}[main]" else "")
        val deleted = JSObject(json).optBoolean("deleted")
        if (deleted) {
            File(context.filesDir, DEV_CREDENTIALS).delete()
            if (keepDives) {
                if (repoDir.exists()) repoDir.renameTo(File(context.filesDir, "carnet.before-${System.currentTimeMillis()}"))
                kept.renameTo(repoDir)
            }
        } else if (kept.exists()) {
            kept.deleteRecursively()
        }
        Log.i(TAG, "deleteAccount: deleted=$deleted")
        call.resolve(JSObject().put("json", json))
    }

    /** Edits one dive as one undoable step; `changes` is the JSON object of edit_dive(). */
    @PluginMethod
    fun editDive(call: PluginCall) = onCoreThread(call) {
        val id = call.getInt("id")
        val changes = call.getObject("changes")
        if (id == null || changes == null) {
            call.reject("Missing id or changes", "BAD_ARGUMENT")
            return@onCoreThread
        }
        call.resolve(JSObject().put("json", NativeCore.editDive(id, changes.toString())))
    }

    /** A trip of the loaded log; its id comes from listDives and is valid until the next load. */
    @PluginMethod
    fun getTrip(call: PluginCall) = onCoreThread(call) {
        call.resolve(JSObject().put("json", NativeCore.getTrip(call.getInt("tripId") ?: 0)))
    }

    /** One undoable trip change (see opendives.h): location, notes, remove, split, merge, add, ungroup. */
    @PluginMethod
    fun tripAction(call: PluginCall) = onCoreThread(call) {
        val ids = call.getArray("diveIds")?.toList<Int>()?.toIntArray()
        val json = NativeCore.tripAction(
            call.getString("action").orEmpty(),
            call.getInt("tripId") ?: 0,
            call.getInt("diveId") ?: 0,
            call.getInt("otherId") ?: 0,
            ids,
            call.getString("value").orEmpty(),
        )
        call.resolve(JSObject().put("json", json))
    }

    @PluginMethod
    fun undo(call: PluginCall) = onCoreThread(call) {
        call.resolve(JSObject().put("json", NativeCore.undo(call.getBoolean("redo", false) == true)))
    }

    /** Local save, then for a cloud log the sync of Subsurface-mobile (fetch, merge, push). */
    @PluginMethod
    fun syncChanges(call: PluginCall) = onCoreThread(call) {
        val json = NativeCore.sync()
        Log.i(TAG, "syncChanges: $json")
        call.resolve(JSObject().put("json", json))
    }

    /** The dives of the log in memory, without loading anything (after a sync that reloaded it). */
    @PluginMethod
    fun listLoadedDives(call: PluginCall) = onCoreThread(call) {
        call.resolve(JSObject().put("json", NativeCore.listLoadedDives()))
    }

    /** Local save only, without network (manual synchronisation). */
    @PluginMethod
    fun saveLocal(call: PluginCall) = onCoreThread(call) {
        NativeCore.saveLocal()
        call.resolve()
    }

    /**
     * A site uuid (an unsigned 32-bit number). Capacitor's getLong returns null
     * for a number small enough to be parsed as an Integer, so read any Number.
     */
    private fun PluginCall.uuid(name: String): Long = (data.opt(name) as? Number)?.toLong() ?: 0L

    /** Read-only site queries (see opendives.h): list, site, nearby, duplicates, without. */
    @PluginMethod
    fun siteQuery(call: PluginCall) = onCoreThread(call) {
        val json = NativeCore.siteQuery(
            call.getString("kind").orEmpty(),
            call.uuid("uuid"),
            call.getInt("lat") ?: 0,
            call.getInt("lon") ?: 0,
            call.getInt("a") ?: 0,
            call.getInt("b") ?: 0,
            call.getString("text").orEmpty(),
        )
        call.resolve(JSObject().put("json", json))
    }

    /** One undoable site change (see opendives.h): create, edit, geocode, merge, delete. */
    @PluginMethod
    fun siteAction(call: PluginCall) = onCoreThread(call) {
        val uuids = call.getArray("uuids")?.toList<Any>()?.map { (it as Number).toLong() }?.toLongArray()
        val json = NativeCore.siteAction(
            call.getString("action").orEmpty(),
            call.uuid("uuid"),
            call.uuid("other"),
            uuids,
            call.getString("field").orEmpty(),
            call.getString("value").orEmpty(),
            call.getInt("lat") ?: 0,
            call.getInt("lon") ?: 0,
        )
        call.resolve(JSObject().put("json", json))
    }

    private fun readSetting(fileName: String, key: String): String {
        val file = File(context.filesDir, fileName)
        if (!file.exists()) return ""
        return file.readLines().map { it.trim() }.firstOrNull { it.startsWith("$key=") }?.substringAfter('=').orEmpty()
    }

    private fun readTestEmail(): String {
        val file = File(context.filesDir, TEST_ACCOUNT)
        if (!file.exists()) return ""
        return file.readLines().map { it.trim() }
            .firstOrNull { it.startsWith("OPENDIVES_CLOUD_TEST_EMAIL=") }
            ?.substringAfter('=').orEmpty()
    }

    private fun readDevCredentials(): Pair<String, String>? {
        val file = File(context.filesDir, DEV_CREDENTIALS)
        if (!file.exists()) return null
        val values = file.readLines()
            .map { it.trim() }
            .filter { it.contains('=') && !it.startsWith("#") }
            .associate { it.substringBefore('=') to it.substringAfter('=') }
        val email = values["OPENDIVES_CLOUD_EMAIL"].orEmpty()
        val password = values["OPENDIVES_CLOUD_PASSWORD"].orEmpty()
        return if (email.isEmpty() || password.isEmpty()) null else email to password
    }

    /** Writes Android's trusted authorities (system and user) as PEM. */
    private fun exportSystemCertificates(target: File): Int {
        val store = KeyStore.getInstance("AndroidCAStore")
        store.load(null, null)
        var count = 0
        val pem = StringBuilder()
        for (alias in store.aliases()) {
            val cert = store.getCertificate(alias) as? X509Certificate ?: continue
            pem.append("-----BEGIN CERTIFICATE-----\n")
            pem.append(Base64.encodeToString(cert.encoded, Base64.DEFAULT))
            pem.append("-----END CERTIFICATE-----\n")
            count++
        }
        val tmp = File(target.parentFile, target.name + ".tmp")
        tmp.writeText(pem.toString())
        tmp.renameTo(target)
        return count
    }

    private fun onCoreThread(call: PluginCall, block: () -> Unit) {
        coreThread.execute {
            try {
                block()
            } catch (e: Exception) {
                Log.e(TAG, "Core error", e)
                call.reject(e.message, "CORE_ERROR", e)
            }
        }
    }

    private companion object {
        const val TAG = "OpenDives"
        const val SAMPLE_ASSET = "SampleDivesV2.ssrf"
        // Offline country and region (core/data/regions.txt, Natural Earth).
        const val REGIONS_ASSET = "regions.txt"
        const val DEV_CREDENTIALS = "cloud-dev.env"
        const val TEST_ACCOUNT = "cloud-test.env"
    }
}
