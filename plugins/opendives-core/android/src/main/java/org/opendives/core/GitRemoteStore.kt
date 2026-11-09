// SPDX-License-Identifier: GPL-2.0
package org.opendives.core

import android.content.Context

/** The access to the user's own git repository (spec, "Own git repository instead of the cloud"). */
internal data class GitRemote(val url: String, val username: String, val branch: String, val token: String) {
    // The token must never end up in a log line or a crash report.
    override fun toString() = "GitRemote(url=$url, username=$username, branch=$branch, token=***)"
}

/**
 * The repository address, user name, branch and access token, as one text
 * encrypted by an Android Keystore key (SealedFile) in `git-remote.bin`, a
 * file excluded from Android backups (res/xml/backup_rules.xml and
 * data_extraction_rules.xml). Separate from the cloud account's file. Nothing
 * in the web layer, nothing logged; the token is handed to the core only.
 */
internal class GitRemoteStore(context: Context) {
    private val sealed = SealedFile(context, "opendives-git-remote", "git-remote.bin")

    fun read(): GitRemote? {
        val parts = sealed.read()?.split('\n') ?: return null
        if (parts.size != 4 || parts.any { it.isEmpty() }) return null
        return GitRemote(parts[0], parts[1], parts[2], parts[3])
    }

    fun write(remote: GitRemote) {
        require(listOf(remote.url, remote.username, remote.branch, remote.token).none { it.isEmpty() || it.contains('\n') })
        sealed.write("${remote.url}\n${remote.username}\n${remote.branch}\n${remote.token}")
    }

    fun delete() = sealed.delete()
}
