// SPDX-License-Identifier: GPL-2.0
package org.opendives.core

import android.Manifest
import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothManager
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import android.util.Base64
import android.util.Log
import android.view.WindowManager
import androidx.activity.result.ActivityResult
import com.getcapacitor.JSObject
import com.getcapacitor.PermissionState
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.ActivityCallback
import com.getcapacitor.annotation.CapacitorPlugin
import com.getcapacitor.annotation.Permission
import com.getcapacitor.annotation.PermissionCallback
import java.io.File
import java.security.KeyStore
import java.security.cert.X509Certificate
import java.util.concurrent.CountDownLatch
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors

/**
 * Bluetooth permissions, asked when the diver opens the download (never at
 * start): Android 12 and later, "Nearby devices" (scan, never used for
 * location, and connect); before, the location, without which Android
 * finds no Bluetooth Low Energy device.
 */
@CapacitorPlugin(
    name = "OpenDivesCore",
    permissions = [
        Permission(strings = [Manifest.permission.BLUETOOTH_SCAN, Manifest.permission.BLUETOOTH_CONNECT], alias = "bluetooth"),
        Permission(strings = [Manifest.permission.ACCESS_FINE_LOCATION], alias = "bluetoothLocation"),
    ],
)
class OpenDivesCorePlugin : Plugin() {
    private val coreThread: ExecutorService = Executors.newSingleThreadExecutor()

    /** Network only (probeCloud): runs while the core thread loads the log. */
    private val networkThread: ExecutorService = Executors.newSingleThreadExecutor()
    private val repoDir: File by lazy { File(context.filesDir, "carnet") }
    private val repo: String by lazy { "${repoDir.absolutePath}[main]" }
    private val credentialStore: CredentialStore by lazy { CredentialStore(context) }

    /**
     * An account being created or signed in to whose logbook does not exist
     * yet: kept in memory only, and stored once its logbook is created.
     */
    private var pendingAccount: Pair<String, String>? = null

    /**
     * Released once the system certificate authorities and the offline regions
     * are set up. Calls that can reach the network or use the regions wait for
     * it; the ones that start the logbook (see onCoreThread) do not, so that
     * the log is read while this work runs on its own thread.
     */
    private val setupDone = CountDownLatch(1)
    private val setupThread: ExecutorService = Executors.newSingleThreadExecutor()

    override fun load() {
        val home = context.filesDir.absolutePath
        val caFile = File(context.cacheDir, "cacerts.pem")
        coreThread.execute {
            NativeCore.init(home)
            setupThread.execute {
                val start = System.currentTimeMillis()
                // The file of the last start is used at once: reading Android's store
                // takes about half a second, which the start cannot wait for.
                val cached = caFile.length() > 0
                try {
                    try {
                        if (!cached) exportSystemCertificates(caFile)
                        NativeCore.setCaFile(caFile.absolutePath)
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
                } finally {
                    setupDone.countDown()
                    Log.i(TAG, "perf: certificates and regions set up in ${System.currentTimeMillis() - start} ms (file kept: $cached)")
                }
                if (cached) {
                    // A system update or an authority installed by the diver changes the
                    // list: checked once the start is over, the new file used from then on.
                    try {
                        Thread.sleep(CERTIFICATES_RECHECK_MS)
                        val count = exportSystemCertificates(caFile)
                        if (count >= 0) {
                            NativeCore.setCaFile(caFile.absolutePath)
                            Log.i(TAG, "$count system certificate authorities exported")
                        }
                    } catch (e: Exception) {
                        Log.e(TAG, "Cannot export the certificate authorities", e)
                    }
                }
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

    /** Planner settings as the core's preferences hold them (plan.cpp). */
    @PluginMethod
    fun plannerSetup(call: PluginCall) = onCoreThread(call) {
        call.resolve(JSObject().put("json", NativeCore.plannerSetup()))
    }

    /** Runs the core's planner; read only (see opendives.h, plan_dive). */
    @PluginMethod
    fun planDive(call: PluginCall) = onCoreThread(call) {
        val request = call.getObject("request")
        if (request == null) {
            call.reject("Missing plan request", "BAD_ARGUMENT")
            return@onCoreThread
        }
        call.resolve(JSObject().put("json", NativeCore.planDive(request.toString())))
    }

    /** The core's preferences shown in Settings (see get_prefs in opendives.h). */
    @PluginMethod
    fun getPrefs(call: PluginCall) = onCoreThread(call, afterSetup = false) {
        call.resolve(JSObject().put("json", NativeCore.getPrefs()))
    }

    /** Sets core preferences; `changes` is the flat JSON object of set_prefs(). */
    @PluginMethod
    fun setPrefs(call: PluginCall) = onCoreThread(call, afterSetup = false) {
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
    fun cylinderTypes(call: PluginCall) = onCoreThread(call, afterSetup = false) {
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
     * The Subsurface cloud account of this device: the one signed in to
     * (Android Keystore, see CredentialStore), or, for development, the
     * credentials of files/cloud-dev.env copied with adb (see app/README.md).
     * They are neither in the APK nor logged.
     *
     * configureCloud() sets the account, without network. Then probeCloud()
     * (server's head, network only) and listCloudDives({cached: true}) (the
     * device's copy, no network) can run at the same time.
     */
    @PluginMethod
    fun configureCloud(call: PluginCall) = onCoreThread(call, afterSetup = false) {
        val credentials = accountCredentials()
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
                setupDone.await()
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
    fun listCloudDives(call: PluginCall) = onCoreThread(call, afterSetup = call.getBoolean("cached", false) != true) {
        val cached = call.getBoolean("cached", false) == true
        val start = System.currentTimeMillis()
        val json = if (cached) {
            NativeCore.cloudListCachedDives()
        } else {
            val credentials = accountCredentials()
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
    fun pendingChanges(call: PluginCall) = onCoreThread(call, afterSetup = false) {
        call.resolve(JSObject().put("json", NativeCore.pendingChanges()))
    }

    /**
     * Signs out: the core closes the log and forgets the account (and deletes
     * the device copy when asked, never with changes not sent), then the
     * stored credentials are forgotten (Android Keystore, and the
     * development file).
     */
    @PluginMethod
    fun signOut(call: PluginCall) = onCoreThread(call) {
        NativeCore.cloudSignOut(call.getBoolean("deleteCopy", false) == true)
        credentialStore.delete()
        pendingAccount = null
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
            credentialStore.delete()
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

    /**
     * Signs in with typed credentials: the account is set, then the server
     * is asked for its log branch (cloud_probe), which checks the password.
     * Rejects with INCORRECT (credentials refused) or NETWORK; the previous
     * account is then set again. With a logbook on the server, the
     * credentials are stored (Android Keystore); without one (an account that
     * has no logbook yet), they wait in memory for createLog. Never logged.
     */
    @PluginMethod
    fun signIn(call: PluginCall) = onCoreThread(call) {
        // "email address MUST be lower case" (Subsurface-mobile).
        val email = call.getString("email").orEmpty().trim().lowercase()
        val password = call.getString("password").orEmpty()
        NativeCore.setCloudTestEmail(readTestEmail())
        NativeCore.cloudConfigure(email, password)
        val json = try {
            NativeCore.cloudProbe()
        } catch (e: IllegalStateException) {
            configureStoredAccount()
            val code = if (e.message?.contains("Credentials rejected") == true) "INCORRECT" else "NETWORK"
            Log.i(TAG, "signIn: $code")
            call.reject(code, code)
            return@onCoreThread
        }
        val exists = JSObject(json).optBoolean("exists")
        if (exists) {
            credentialStore.write(email, password)
            pendingAccount = null
        } else {
            pendingAccount = email to password
        }
        Log.i(TAG, "signIn: verified, logbook on the server: $exists")
        call.resolve(JSObject().put("exists", exists).put("email", email))
    }

    /**
     * New account, step 1 (cloud_create_account; a cloud write, under the
     * write lock). "need_pin": the server mailed a code, the credentials
     * wait in memory for verifyPin. "verified": the account already exists
     * with this password (sign in instead). "incorrect": refused.
     */
    @PluginMethod
    fun createAccount(call: PluginCall) = onCoreThread(call) {
        val email = call.getString("email").orEmpty().trim().lowercase()
        val password = call.getString("password").orEmpty()
        NativeCore.setCloudTestEmail(readTestEmail())
        val result = JSObject(NativeCore.cloudCreateAccount(email, password))
        val status = result.optString("status")
        if (status == "need_pin") pendingAccount = email to password
        // The server's reply never holds the password.
        Log.i(TAG, "createAccount: $status (HTTP ${result.optInt("http")}, ${result.optString("reply")})")
        call.resolve(JSObject().put("status", status).put("email", email))
    }

    /** "Renvoyer le code": the same request as createAccount, for the account waiting for its code. */
    @PluginMethod
    fun resendCode(call: PluginCall) = onCoreThread(call) {
        val account = pendingAccount
        if (account == null) {
            call.reject("NO_ACCOUNT", "NO_ACCOUNT")
            return@onCoreThread
        }
        NativeCore.setCloudTestEmail(readTestEmail())
        val result = JSObject(NativeCore.cloudCreateAccount(account.first, account.second))
        val status = result.optString("status")
        Log.i(TAG, "resendCode: $status (HTTP ${result.optInt("http")}, ${result.optString("reply")})")
        call.resolve(JSObject().put("status", status))
    }

    /** New account, the confirmation code (cloud_verify_pin). "verified": the account is set (in memory). */
    @PluginMethod
    fun verifyPin(call: PluginCall) = onCoreThread(call) {
        val account = pendingAccount
        if (account == null) {
            call.reject("NO_ACCOUNT", "NO_ACCOUNT")
            return@onCoreThread
        }
        NativeCore.setCloudTestEmail(readTestEmail())
        val pin = call.getString("pin").orEmpty().trim()
        val result = JSObject(NativeCore.cloudVerifyPin(account.first, account.second, pin))
        val status = result.optString("status")
        if (status == "verified") NativeCore.cloudConfigure(account.first, account.second)
        Log.i(TAG, "verifyPin: $status (HTTP ${result.optInt("http")}, ${result.optString("reply")})")
        call.resolve(JSObject().put("status", status))
    }

    /** Downloads of divelogs.de waiting for the account's first logbook (app cache, deleted after use). */
    private fun importFile(path: String): File? {
        val file = File(path)
        return if (file.parentFile?.canonicalPath == context.cacheDir.canonicalPath && file.name.startsWith(IMPORT_PREFIX)) file else null
    }

    /**
     * Import, step 1: downloads the divelogs.de logbook once into the app's
     * cache. `user` and `password` are only passed to the core, never kept or
     * logged. Writes {dives, path}; with no dive, no file (path empty).
     */
    @PluginMethod
    fun divelogsDownload(call: PluginCall) = onCoreThread(call) {
        val target = File(context.cacheDir, "$IMPORT_PREFIX${System.currentTimeMillis()}.dld")
        try {
            val result = JSObject(
                NativeCore.divelogsDownload(call.getString("user").orEmpty(), call.getString("password").orEmpty(), target.absolutePath),
            )
            val dives = result.optInt("dives")
            Log.i(TAG, "divelogsDownload: $dives dives")
            call.resolve(JSObject().put("dives", dives).put("path", if (dives > 0) target.absolutePath else ""))
        } catch (e: Exception) {
            target.delete()
            throw e
        }
    }

    /**
     * Step 2's "Continuer" with divelogs.de: checks the credentials before
     * the import starts (divelogs_check), {dives}. Rejects with LOGIN_FAILED,
     * NETWORK… The credentials are only passed to the core.
     */
    @PluginMethod
    fun divelogsCheck(call: PluginCall) = onCoreThread(call) {
        call.resolve(JSObject(NativeCore.divelogsCheck(call.getString("user").orEmpty(), call.getString("password").orEmpty())))
    }

    /**
     * Step 2's "Depuis un fichier": the file picked in the web layer
     * (`name`, base64 `data`) is written to the app's cache for the import
     * steps (importCount, createLog); {path}.
     */
    @PluginMethod
    fun stageImport(call: PluginCall) = onCoreThread(call) {
        val name = File(call.getString("name").orEmpty()).name.replace(Regex("[^A-Za-z0-9._-]"), "_").ifEmpty { "import.xml" }
        val data = call.getString("data")
        if (data == null) {
            call.reject("BAD_REQUEST", "BAD_REQUEST")
            return@onCoreThread
        }
        val file = File(context.cacheDir, "$IMPORT_PREFIX${System.currentTimeMillis()}-$name")
        file.writeBytes(Base64.decode(data, Base64.DEFAULT))
        call.resolve(JSObject().put("path", file.absolutePath))
    }

    /** Import, step 2: reads the downloaded file (read-only), {dives}. */
    @PluginMethod
    fun importCount(call: PluginCall) = onCoreThread(call) {
        val file = importFile(call.getString("path").orEmpty())
        if (file == null) {
            call.reject("BAD_REQUEST", "BAD_REQUEST")
            return@onCoreThread
        }
        call.resolve(JSObject(NativeCore.importCount(file.absolutePath)))
    }

    /** Cancelled or failed import: the downloaded file is deleted. */
    @PluginMethod
    fun discardImport(call: PluginCall) = onCoreThread(call) {
        importFile(call.getString("path").orEmpty())?.delete()
        call.resolve()
    }

    /**
     * First logbook of the account just created or signed in to
     * (cloud_create_log, the only step that writes to the account): "empty";
     * "import", the file downloaded by divelogsDownload (`path`, deleted
     * afterwards); or "device", the logbook of this device. The account's
     * credentials are then stored.
     */
    @PluginMethod
    fun createLog(call: PluginCall) = onCoreThread(call) {
        val account = pendingAccount
        if (account == null) {
            call.reject("NO_ACCOUNT", "NO_ACCOUNT")
            return@onCoreThread
        }
        NativeCore.setCloudTestEmail(readTestEmail())
        NativeCore.cloudConfigure(account.first, account.second)
        val source = call.getString("source").orEmpty()
        var download: File? = null
        val importPath = when (source) {
            "import" -> {
                download = importFile(call.getString("path").orEmpty())
                if (download == null) {
                    call.reject("BAD_REQUEST", "BAD_REQUEST")
                    return@onCoreThread
                }
                download.absolutePath
            }
            "device" -> if (NativeCore.logExists(repo)) repo else ""
            "empty" -> ""
            else -> {
                call.reject("BAD_REQUEST", "BAD_REQUEST")
                return@onCoreThread
            }
        }
        try {
            val json = NativeCore.cloudCreateLog(importPath)
            credentialStore.write(account.first, account.second)
            pendingAccount = null
            Log.i(TAG, "createLog($source): created")
            call.resolve(JSObject().put("json", json))
        } finally {
            download?.delete()
        }
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

    /** One undoable trip change (see opendives.h): location, notes, remove, split, merge, add, ungroup, create. */
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

    /** Read-only tools (see opendives.h): gas (calculator), cylinders (types), desaturation. */
    @PluginMethod
    fun toolQuery(call: PluginCall) = onCoreThread(call) {
        val json = NativeCore.toolQuery(
            call.getString("kind").orEmpty(),
            call.getInt("o2") ?: 0,
            call.getInt("he") ?: 0,
            call.getInt("po2") ?: 0,
            call.getInt("depth") ?: 0,
        )
        call.resolve(JSObject().put("json", json))
    }

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

    /**
     * Read-only free filter (see opendives.h): kind "options", or "dives" with
     * fulltext, mode and rules [{type, stringMode, rangeMode, negate, data}].
     */
    @PluginMethod
    fun filterQuery(call: PluginCall) = onCoreThread(call) {
        val rules = mutableListOf<String>()
        val list = call.getArray("rules")
        if (list != null) {
            for (i in 0 until list.length()) {
                val rule = list.getJSONObject(i)
                rules.add(rule.optString("type"))
                rules.add(rule.optString("stringMode"))
                rules.add(rule.optString("rangeMode"))
                rules.add(if (rule.optBoolean("negate")) "1" else "0")
                rules.add(rule.optString("data"))
            }
        }
        val json = NativeCore.filterQuery(
            call.getString("kind").orEmpty(),
            call.getString("fulltext").orEmpty(),
            call.getString("mode").orEmpty(),
            rules.toTypedArray(),
        )
        call.resolve(JSObject().put("json", json))
    }

    /** The five strings per rule that the native side takes (see filterQuery). */
    private fun PluginCall.flatRules(): Array<String> {
        val rules = mutableListOf<String>()
        val list = getArray("rules") ?: return rules.toTypedArray()
        for (i in 0 until list.length()) {
            val rule = list.getJSONObject(i)
            rules.add(rule.optString("type"))
            rules.add(rule.optString("stringMode"))
            rules.add(rule.optString("rangeMode"))
            rules.add(if (rule.optBoolean("negate")) "1" else "0")
            rules.add(rule.optString("data"))
        }
        return rules.toTypedArray()
    }

    /** Logs a dive by hand (create_dive): one undoable step. */
    @PluginMethod
    fun createDive(call: PluginCall) = onCoreThread(call) {
        val fields = call.getObject("fields")
        if (fields == null) {
            call.reject("Missing fields", "BAD_ARGUMENT")
            return@onCoreThread
        }
        call.resolve(JSObject().put("json", NativeCore.createDive(fields.toString())))
    }

    /** Deletes a dive (delete_dive): one undoable step. */
    @PluginMethod
    fun deleteDive(call: PluginCall) = onCoreThread(call) {
        // One dive ("id") or several ("ids"), one undoable step.
        val ids = call.getArray("ids")?.toList<Int>()?.toIntArray() ?: call.getInt("id")?.let { intArrayOf(it) }
        if (ids == null || ids.isEmpty()) {
            call.reject("Missing id", "BAD_ARGUMENT")
            return@onCoreThread
        }
        call.resolve(JSObject().put("json", NativeCore.deleteDive(ids)))
    }

    /** Renumbers dives in date order (renumber_dives): all of them if no ids, one undoable step. */
    @PluginMethod
    fun renumberDives(call: PluginCall) = onCoreThread(call) {
        val start = call.getInt("start")
        if (start == null) {
            call.reject("Missing start", "BAD_ARGUMENT")
            return@onCoreThread
        }
        val ids = call.getArray("ids")?.toList<Int>()?.toIntArray() ?: IntArray(0)
        call.resolve(JSObject().put("json", NativeCore.renumberDives(ids, start)))
    }

    /**
     * Imports a file chosen in the WebView (import_dives): its bytes arrive in
     * base64, are written to a temporary file with the original name (the core
     * reads the format from it), imported, then the copy is deleted.
     */
    @PluginMethod
    fun importDives(call: PluginCall) = onCoreThread(call) {
        val name = File(call.getString("name").orEmpty()).name.ifEmpty { "import.xml" }
        val data = call.getString("data")
        if (data == null) {
            call.reject("Missing data", "BAD_ARGUMENT")
            return@onCoreThread
        }
        val dir = File(context.cacheDir, "import").apply { mkdirs() }
        val file = File(dir, name)
        try {
            file.writeBytes(Base64.decode(data, Base64.DEFAULT))
            call.resolve(JSObject().put("json", NativeCore.importDives(file.absolutePath, name)))
        } finally {
            file.delete()
        }
    }

    /**
     * The dives logged on this device without an account (its own log), once
     * an account is used: "count" reads them apart; "import" adds them to the
     * account's log in memory as one undoable step (import_dives, Subsurface's
     * merge rules: a dive already there is not doubled). The device's log
     * itself is kept as it is.
     */
    @PluginMethod
    fun deviceLog(call: PluginCall) = onCoreThread(call) {
        val exists = NativeCore.logExists(repo)
        when (call.getString("action")) {
            "count" -> call.resolve(JSObject().put("count", if (exists) NativeCore.countDives(repo) else 0))
            "import" -> {
                if (!exists) {
                    call.reject("NO_DIVES", "NO_DIVES")
                    return@onCoreThread
                }
                call.resolve(JSObject().put("json", NativeCore.importDives(repo, "this device")))
            }
            else -> call.reject("BAD_REQUEST", "BAD_REQUEST")
        }
    }

    /** Filter presets of the log: list, save (undoable), delete (undoable). */
    @PluginMethod
    fun filterPresets(call: PluginCall) = onCoreThread(call) {
        val json = NativeCore.filterPresets(
            call.getString("action").orEmpty(),
            call.getString("name").orEmpty(),
            call.getString("fulltext").orEmpty(),
            call.getString("mode").orEmpty(),
            call.flatRules(),
            call.getInt("index") ?: -1,
        )
        call.resolve(JSObject().put("json", json))
    }

    /** Sync conflict after an automatic merge (read-only). */
    @PluginMethod
    fun syncConflicts(call: PluginCall) = onCoreThread(call, afterSetup = false) {
        call.resolve(JSObject().put("json", NativeCore.syncConflicts()))
    }

    /** Keeps the chosen side of each conflicting file ({path: "device"|"cloud"}), then reads the log again. */
    @PluginMethod
    fun resolveConflicts(call: PluginCall) = onCoreThread(call) {
        val choices = call.getObject("choices")
        if (choices == null) {
            call.reject("Missing choices", "BAD_ARGUMENT")
            return@onCoreThread
        }
        NativeCore.resolveConflicts(choices.toString())
        call.resolve()
    }

    /**
     * Read-only statistics (see opendives.h): kind "stats" with `criteria`
     * ({field: [values]}), or "values" with `field`.
     */
    @PluginMethod
    fun statsQuery(call: PluginCall) = onCoreThread(call) {
        val kind = call.getString("kind").orEmpty()
        val text = if (kind == "values") call.getString("field").orEmpty()
                   else (call.getObject("criteria") ?: JSObject()).toString()
        call.resolve(JSObject().put("json", NativeCore.statsQuery(kind, text)))
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

    // --- Download from a dive computer (Bluetooth) ------------------------------

    private val bluetoothAdapter: BluetoothAdapter? by lazy {
        (context.getSystemService(Context.BLUETOOTH_SERVICE) as? BluetoothManager)?.adapter
    }

    private val permissionAlias: String
        get() = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) "bluetooth" else "bluetoothLocation"

    private var scan: BluetoothScan? = null
    private var transport: BluetoothTransport? = null

    private fun bluetoothStatusObject(): JSObject {
        val adapter = bluetoothAdapter
        val state = getPermissionState(permissionAlias)
        return JSObject()
            .put("bluetooth", if (adapter == null) "none" else if (adapter.isEnabled) "on" else "off")
            .put("permission", when (state) {
                PermissionState.GRANTED -> "granted"
                PermissionState.DENIED -> "denied"
                else -> "prompt"
            })
    }

    /** {bluetooth: "none"|"off"|"on", permission: "granted"|"denied"|"prompt"}. */
    @PluginMethod
    fun bluetoothStatus(call: PluginCall) {
        call.resolve(bluetoothStatusObject())
    }

    /** Asks for the Bluetooth permissions of this Android version; resolves with bluetoothStatus. */
    @PluginMethod
    fun requestBluetoothPermission(call: PluginCall) {
        if (getPermissionState(permissionAlias) == PermissionState.GRANTED) {
            call.resolve(bluetoothStatusObject())
            return
        }
        requestPermissionForAlias(permissionAlias, call, "bluetoothPermissionResult")
    }

    @PermissionCallback
    private fun bluetoothPermissionResult(call: PluginCall) {
        val status = bluetoothStatusObject()
        Log.i(TAG, "Bluetooth permission: ${status.optString("permission")}")
        call.resolve(status)
    }

    /** The system dialog that turns Bluetooth on; resolves with bluetoothStatus. */
    @PluginMethod
    fun enableBluetooth(call: PluginCall) {
        if (bluetoothAdapter == null || bluetoothAdapter?.isEnabled == true) {
            call.resolve(bluetoothStatusObject())
            return
        }
        startActivityForResult(call, Intent(BluetoothAdapter.ACTION_REQUEST_ENABLE), "enableBluetoothResult")
    }

    @ActivityCallback
    private fun enableBluetoothResult(call: PluginCall, result: ActivityResult) {
        call.resolve(bluetoothStatusObject())
    }

    /** The first screen is drawn: the launch screen can go (see SplashGate). */
    @PluginMethod
    fun contentShown(call: PluginCall) {
        SplashGate.contentShown = true
        call.resolve()
    }

    /** This app's page of the system settings, where a refused permission can be given. */
    @PluginMethod
    fun openAppSettings(call: PluginCall) {
        val intent = Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.fromParts("package", context.packageName, null))
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        context.startActivity(intent)
        call.resolve()
    }

    /**
     * Looks for dive computers for `durationMs` (default 60 s): each device
     * found comes as a "bluetoothDevice" event, {mac, name, le, classic,
     * bonded, rssi, computer (JSON: {vendor, product} or null)}; the end of
     * the scan as "bluetoothScanStopped". Rejects with NO_BLUETOOTH,
     * BLUETOOTH_OFF, PERMISSION.
     */
    @PluginMethod
    fun startBluetoothScan(call: PluginCall) {
        val adapter = bluetoothAdapter
        if (adapter == null) return call.reject("NO_BLUETOOTH", "NO_BLUETOOTH")
        if (getPermissionState(permissionAlias) != PermissionState.GRANTED) return call.reject("PERMISSION", "PERMISSION")
        if (!adapter.isEnabled) return call.reject("BLUETOOTH_OFF", "BLUETOOTH_OFF")
        val s = scan ?: BluetoothScan(
            adapter,
            onDevice = { notifyListeners("bluetoothDevice", it) },
            onStopped = { notifyListeners("bluetoothScanStopped", JSObject()) },
        ).also { scan = it }
        try {
            s.start(call.getLong("durationMs") ?: 60_000L)
            call.resolve()
        } catch (e: SecurityException) {
            call.reject("PERMISSION", "PERMISSION", e)
        }
    }

    @PluginMethod
    fun stopBluetoothScan(call: PluginCall) {
        scan?.stop()
        call.resolve()
    }

    /** Models that download over Bluetooth (dc_bluetooth_models), for a device whose name says nothing. */
    @PluginMethod
    fun bluetoothModels(call: PluginCall) {
        call.resolve(JSObject().put("json", NativeCore.dcBluetoothModels()))
    }

    /**
     * Downloads the new dives of a dive computer and adds them to the logbook
     * as one undoable step (download_dives in opendives.h): {vendor, product,
     * address ("LE:" + MAC, or the MAC for Bluetooth Classic), name,
     * forceDownload}. Progress comes as "downloadProgress" events ({json}).
     * The screen stays on meanwhile. libdivecomputer's log is written to
     * files/libdivecomputer.log; after a failure, its end goes to logcat.
     */
    @PluginMethod
    fun downloadDives(call: PluginCall) {
        val adapter = bluetoothAdapter
        if (adapter == null) return call.reject("NO_BLUETOOTH", "NO_BLUETOOTH")
        if (getPermissionState(permissionAlias) != PermissionState.GRANTED) return call.reject("PERMISSION", "PERMISSION")
        if (!adapter.isEnabled) return call.reject("BLUETOOTH_OFF", "BLUETOOTH_OFF")
        // As Subsurface (getBtDeviceInfo): the scan stops before connecting.
        val s = scan
        s?.stop()
        val t = transport ?: BluetoothTransport(context, adapter) { mac -> scan?.device(mac) }.also { transport = it }
        t.reset()
        val request = JSObject()
            .put("classicAddress", call.getString("classicAddress").orEmpty())
            .put("vendor", call.getString("vendor").orEmpty())
            .put("product", call.getString("product").orEmpty())
            .put("address", call.getString("address").orEmpty())
            .put("name", call.getString("name").orEmpty())
            .put("forceDownload", call.getBoolean("forceDownload", false) == true)
        val logFile = File(context.filesDir, LIBDC_LOG)
        request.put("logFile", logFile.absolutePath)
        keepScreenOn(true)
        coreThread.execute {
            val start = System.currentTimeMillis()
            try {
                Log.i(TAG, "downloadDives: $request")
                val json = NativeCore.downloadDives(request.toString(), t) { progress ->
                    notifyListeners("downloadProgress", JSObject().put("json", progress))
                }
                Log.i(TAG, "downloadDives: done in ${System.currentTimeMillis() - start} ms: $json")
                call.resolve(JSObject().put("json", json))
            } catch (e: Exception) {
                Log.e(TAG, "downloadDives failed after ${System.currentTimeMillis() - start} ms: ${e.message}")
                logTail(logFile)
                call.reject(e.message, "CORE_ERROR", e)
            } finally {
                keepScreenOn(false)
            }
        }
    }

    /**
     * The dives received before a download failed or was cancelled
     * (download_partial): action "count" ({dives}), "keep" (one undoable
     * step, the object of downloadDives) or "discard".
     */
    @PluginMethod
    fun downloadPartial(call: PluginCall) = onCoreThread(call) {
        val action = call.getString("action").orEmpty()
        val json = NativeCore.downloadPartial(action)
        Log.i(TAG, "downloadPartial($action): $json")
        call.resolve(JSObject().put("json", json))
    }

    /** Stops the running download (off the core thread, which is busy with it). */
    @PluginMethod
    fun cancelDownload(call: PluginCall) {
        Log.i(TAG, "cancelDownload")
        NativeCore.downloadCancel()
        transport?.cancel()
        call.resolve()
    }

    private fun keepScreenOn(on: Boolean) {
        val activity = activity ?: return
        activity.runOnUiThread {
            if (on) activity.window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
            else activity.window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        }
    }

    /** The end of libdivecomputer's log, to diagnose a failed download with `adb logcat -s OpenDives`. */
    private fun logTail(file: File) {
        if (!file.exists()) return
        try {
            val lines = file.readLines()
            Log.i(TAG, "--- end of ${file.name} (${lines.size} lines) ---")
            for (line in lines.takeLast(200)) Log.i(TAG, "libdc: $line")
        } catch (e: Exception) {
            Log.w(TAG, "Cannot read ${file.name}", e)
        }
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

    /** The stored account, else the development credentials. */
    private fun accountCredentials(): Pair<String, String>? = credentialStore.read() ?: readDevCredentials()

    /** After a failed sign-in: the account of this device again, if any. */
    private fun configureStoredAccount() {
        val credentials = accountCredentials()
        try {
            NativeCore.cloudConfigure(credentials?.first.orEmpty(), credentials?.second.orEmpty())
        } catch (e: IllegalStateException) {
            // No account: none is set.
        }
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

    /**
     * Writes Android's trusted authorities (system and user) as PEM; -1 when the
     * file already holds them.
     */
    private fun exportSystemCertificates(target: File): Int {
        val store = KeyStore.getInstance("AndroidCAStore")
        store.load(null, null)
        // Converting the certificates is what takes time (about 0.5 s). The aliases name
        // each authority by its hash, so the same list on the same system build
        // means the same file: it is kept from one start to the next.
        val aliases = store.aliases().toList().sorted()
        val key = Build.FINGERPRINT + "\n" + aliases.joinToString("\n")
        val keyFile = File(target.parentFile, target.name + ".key")
        if (target.length() > 0 && keyFile.exists() && keyFile.readText() == key) return -1
        var count = 0
        val pem = StringBuilder()
        for (alias in aliases) {
            val cert = store.getCertificate(alias) as? X509Certificate ?: continue
            pem.append("-----BEGIN CERTIFICATE-----\n")
            pem.append(Base64.encodeToString(cert.encoded, Base64.DEFAULT))
            pem.append("-----END CERTIFICATE-----\n")
            count++
        }
        val tmp = File(target.parentFile, target.name + ".tmp")
        tmp.writeText(pem.toString())
        tmp.renameTo(target)
        keyFile.writeText(key)
        return count
    }

    /**
     * `afterSetup` false: the call neither reaches the network nor needs the
     * regions, and does not wait for the certificates (start of the logbook).
     */
    private fun onCoreThread(call: PluginCall, afterSetup: Boolean = true, block: () -> Unit) {
        coreThread.execute {
            try {
                if (afterSetup) setupDone.await()
                block()
            } catch (e: Exception) {
                Log.e(TAG, "Core error", e)
                call.reject(e.message, "CORE_ERROR", e)
            }
        }
    }

    private companion object {
        const val TAG = "OpenDives"
        const val CERTIFICATES_RECHECK_MS = 20_000L
        const val SAMPLE_ASSET = "SampleDivesV2.ssrf"
        // Offline country and region (core/data/regions.txt, Natural Earth).
        const val REGIONS_ASSET = "regions.txt"
        const val DEV_CREDENTIALS = "cloud-dev.env"
        const val TEST_ACCOUNT = "cloud-test.env"
        const val IMPORT_PREFIX = "import-"
        const val LIBDC_LOG = "libdivecomputer.log"
    }
}
