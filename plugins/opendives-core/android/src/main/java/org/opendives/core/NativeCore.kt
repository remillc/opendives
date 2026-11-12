// SPDX-License-Identifier: GPL-2.0
package org.opendives.core

/** Access to the C++ core. The core is not reentrant: only one thread may call it. */
internal object NativeCore {
    init {
        System.loadLibrary("opendives")
    }

    external fun init(home: String)
    external fun logExists(repo: String): Boolean
    external fun countDives(log: String): Int
    external fun importFile(source: String, repo: String): Int
    external fun listDives(repo: String): String
    external fun getDive(id: Int): String
    external fun getPrefs(): String
    external fun setPrefs(changes: String)
    external fun cylinderTypes(action: String, name: String, value: String, ml: Int, mbar: Int): String
    external fun plannerSetup(): String
    external fun planDive(request: String): String
    external fun listPlans(): String
    external fun savePlan(request: String, replaceId: Int, title: String): String
    external fun setCaFile(path: String)
    external fun cloudListDives(email: String, password: String): String
    external fun cloudConfigure(email: String, password: String)
    external fun cloudListCachedDives(): String
    external fun pendingChanges(): String
    external fun cloudSignOut(deleteCopy: Boolean)
    external fun editDive(id: Int, changes: String): String
    external fun undo(redo: Boolean): String
    external fun getTrip(id: Int): String
    external fun siteQuery(kind: String, uuid: Long, lat: Int, lon: Int, a: Int, b: Int, text: String): String
    external fun filterQuery(kind: String, fulltext: String, mode: String, rules: Array<String>): String
    external fun createDive(fields: String): String
    external fun deleteDive(ids: IntArray): String
    external fun renumberDives(ids: IntArray, start: Int, numbers: IntArray): String
    external fun importDives(file: String, source: String): String
    external fun filterPresets(action: String, name: String, fulltext: String, mode: String, rules: Array<String>, index: Int): String
    external fun syncConflicts(): String
    external fun cancelConflictResolution()
    external fun resolveConflicts(choices: String)
    external fun statsQuery(kind: String, text: String): String
    external fun siteAction(action: String, uuid: Long, other: Long, uuids: LongArray?, field: String, value: String, lat: Int, lon: Int): String
    external fun setRegionsFile(path: String)
    external fun setXsltDir(dir: String)
    external fun exportDives(ids: IntArray, format: String, anonymize: Boolean, path: String)
    external fun toolQuery(kind: String, o2: Int, he: Int, po2: Int, depth: Int, args: IntArray?): String
    external fun tripAction(action: String, tripId: Int, diveId: Int, otherId: Int, diveIds: IntArray?, value: String): String
    external fun diveComputers(): String
    external fun diveComputerAction(action: String, model: String, serial: String, value: String, intoModel: String, intoSerial: String): String
    external fun sync(): String
    /** Receives the messages of the cloud log's git work (opendives.h, set_sync_progress); null stops them. */
    external fun setSyncListener(listener: DownloadListener?)
    external fun saveLocal()
    external fun listLoadedDives(): String
    external fun setCloudTestEmail(email: String)
    external fun cloudDeleteAccount(password: String, keepDivesIn: String): String
    external fun cloudCreateAccount(email: String, password: String): String
    external fun cloudVerifyPin(email: String, password: String, pin: String): String
    external fun cloudCreateLog(importPath: String): String

    /** Own git repository: the references of the repository (opendives.h, git_check); any thread. */
    external fun gitCheck(url: String, username: String, token: String): String
    external fun gitConfigure(url: String, username: String, token: String, branch: String)
    external fun gitCreateLog(): String
    external fun importCount(path: String): String
    external fun divelogsCheck(user: String, password: String): String
    external fun divelogsDownload(user: String, password: String, outPath: String): String

    /** The one call allowed off the core thread, even during a load (see opendives.h). */
    external fun cloudProbe(): String

    /** Dive computer of a Bluetooth name ({vendor, product} or null, as JSON); any thread. */
    external fun dcFromBluetoothName(name: String): String

    /** Models that download over Bluetooth (JSON); any thread. */
    external fun dcBluetoothModels(): String

    /** Blocks for the whole download (download_dives in opendives.h); on the core thread. */
    external fun downloadDives(request: String, transport: BluetoothTransport, listener: DownloadListener): String

    /** Dives received before a failure: "count", "keep" (one undoable step) or "discard"; on the core thread. */
    external fun downloadPartial(action: String): String

    /** Asks the running download to stop; from any thread. */
    external fun downloadCancel()
}

/** Progress of a download, called on the core thread (see download_progress in opendives.h). */
internal fun interface DownloadListener {
    fun onProgress(json: String)
}
