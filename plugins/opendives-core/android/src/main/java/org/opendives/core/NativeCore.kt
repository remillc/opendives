// SPDX-License-Identifier: GPL-2.0
package org.opendives.core

/** Accès au cœur C++. Le cœur n'est pas réentrant : un seul fil doit l'appeler. */
internal object NativeCore {
    init {
        System.loadLibrary("opendives")
    }

    external fun init(home: String)
    external fun logExists(repo: String): Boolean
    external fun importFile(source: String, repo: String): Int
    external fun listDives(repo: String): String
}
