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
    external fun setCaFile(path: String)
    external fun cloudListDives(email: String, password: String): String
}
