// SPDX-License-Identifier: GPL-2.0
package org.opendives.core

import android.util.Base64
import android.util.Log
import com.getcapacitor.JSArray
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
                Log.i(TAG, "$count autorités de certification du système exportées")
            } catch (e: Exception) {
                Log.e(TAG, "Export des autorités de certification impossible", e)
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
        Log.i(TAG, "importSample: $count plongées enregistrées dans $repo")
        call.resolve(JSObject().put("count", count))
    }

    @PluginMethod
    fun listDives(call: PluginCall) = onCoreThread(call) {
        val exists = NativeCore.logExists(repo)
        val dives = if (exists) JSArray(NativeCore.listDives(repo)) else JSArray()
        Log.i(TAG, "listDives: exists=$exists, ${dives.length()} plongées lues depuis $repo")
        call.resolve(JSObject().put("exists", exists).put("dives", dives))
    }

    /** Détail d'une plongée du carnet chargé ; `id` vient de listDives ou listCloudDives. */
    @PluginMethod
    fun getDive(call: PluginCall) = onCoreThread(call) {
        val id = call.getInt("id")
        if (id == null) {
            call.reject("Identifiant de plongée manquant", "BAD_ARGUMENT")
            return@onCoreThread
        }
        call.resolve(JSObject(NativeCore.getDive(id)))
    }

    /** Unités du carnet chargé, une par mesure. */
    @PluginMethod
    fun getPrefs(call: PluginCall) = onCoreThread(call) {
        call.resolve(JSObject(NativeCore.getPrefs()))
    }

    /**
     * Lecture seule du cloud Subsurface. TEMPORAIRE, pour le développement :
     * les identifiants sont lus dans files/cloud-dev.env, copié par adb
     * (voir app/README.md). Ils ne sont ni dans l'APK ni journalisés.
     */
    @PluginMethod
    fun listCloudDives(call: PluginCall) = onCoreThread(call) {
        val credentials = readDevCredentials()
        if (credentials == null) {
            call.resolve(JSObject().put("available", false))
            return@onCoreThread
        }
        val start = System.currentTimeMillis()
        val result = JSObject(NativeCore.cloudListDives(credentials.first, credentials.second))
        val dives = result.getJSONArray("dives")
        Log.i(
            TAG,
            "listCloudDives: ${dives.length()} plongées, serveur ${result.getString("server")}, " +
                "synced=${result.getBoolean("synced")}, ${System.currentTimeMillis() - start} ms",
        )
        result.put("available", true)
        call.resolve(result)
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

    /** Écrit en PEM les autorités de confiance d'Android (système et utilisateur). */
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
                Log.e(TAG, "Erreur du cœur", e)
                call.reject(e.message, "CORE_ERROR", e)
            }
        }
    }

    private companion object {
        const val TAG = "OpenDives"
        const val SAMPLE_ASSET = "SampleDivesV2.ssrf"
        const val DEV_CREDENTIALS = "cloud-dev.env"
    }
}
