// SPDX-License-Identifier: GPL-2.0
package org.opendives.core

/** Access to the C++ core. The core is not reentrant: only one thread may call it. */
internal object NativeCore {
    init {
        System.loadLibrary("opendives")
    }

    external fun init(home: String)
    external fun logExists(repo: String): Boolean
    external fun importFile(source: String, repo: String): Int
    external fun listDives(repo: String): String
    external fun getDive(id: Int): String
    external fun getPrefs(): String
    external fun setPrefs(changes: String)
    external fun cylinderTypes(action: String, name: String, value: String, ml: Int, mbar: Int): String
    external fun plannerSetup(): String
    external fun planDive(request: String): String
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
    external fun siteAction(action: String, uuid: Long, other: Long, uuids: LongArray?, field: String, value: String, lat: Int, lon: Int): String
    external fun setRegionsFile(path: String)
    external fun toolQuery(kind: String, o2: Int, he: Int, po2: Int, depth: Int): String
    external fun tripAction(action: String, tripId: Int, diveId: Int, otherId: Int, diveIds: IntArray?, value: String): String
    external fun sync(): String
    external fun saveLocal()
    external fun listLoadedDives(): String
    external fun setCloudTestEmail(email: String)
    external fun cloudDeleteAccount(password: String, keepDivesIn: String): String

    /** The one call allowed off the core thread, even during a load (see opendives.h). */
    external fun cloudProbe(): String
}
