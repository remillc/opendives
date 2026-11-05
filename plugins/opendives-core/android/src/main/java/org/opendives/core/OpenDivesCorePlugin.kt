// SPDX-License-Identifier: GPL-2.0
package org.opendives.core

import android.util.Log
import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import java.io.File
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors

@CapacitorPlugin(name = "OpenDivesCore")
class OpenDivesCorePlugin : Plugin() {
    private val coreThread: ExecutorService = Executors.newSingleThreadExecutor()
    private val repoDir: File by lazy { File(context.filesDir, "carnet") }
    private val repo: String by lazy { "${repoDir.absolutePath}[main]" }

    override fun load() {
        val home = context.filesDir.absolutePath
        coreThread.execute { NativeCore.init(home) }
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
    }
}
