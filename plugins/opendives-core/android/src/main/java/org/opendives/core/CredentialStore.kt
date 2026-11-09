// SPDX-License-Identifier: GPL-2.0
package org.opendives.core

import android.content.Context

/**
 * The Subsurface cloud account of this device (spec, section 4, "Sign out":
 * the credentials live in the keychain). An AES key that never leaves the
 * Android Keystore encrypts "email\npassword" in the app's private storage
 * (see SealedFile). Nothing in the web layer, nothing logged.
 */
internal class CredentialStore(context: Context) {
    private val sealed = SealedFile(context, "opendives-cloud-account", "cloud-account.bin")

    fun read(): Pair<String, String>? {
        val text = sealed.read() ?: return null
        val email = text.substringBefore('\n')
        val password = text.substringAfter('\n', "")
        return if (email.isEmpty() || password.isEmpty()) null else email to password
    }

    fun write(email: String, password: String) = sealed.write("$email\n$password")

    fun delete() = sealed.delete()
}
