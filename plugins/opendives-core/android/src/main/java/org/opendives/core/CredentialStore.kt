// SPDX-License-Identifier: GPL-2.0
package org.opendives.core

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import java.io.File
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/**
 * The Subsurface cloud account of this device (spec, section 4, "Sign out":
 * the credentials live in the keychain). An AES key that never leaves the
 * Android Keystore encrypts "email\npassword" in the app's private storage.
 * Nothing in the web layer, nothing logged.
 */
internal class CredentialStore(context: Context) {
    private val file = File(context.filesDir, FILE_NAME)

    fun read(): Pair<String, String>? {
        if (!file.exists()) return null
        return try {
            val bytes = file.readBytes()
            val iv = bytes.copyOfRange(0, IV_SIZE)
            val cipher = Cipher.getInstance(TRANSFORMATION)
            cipher.init(Cipher.DECRYPT_MODE, key() ?: return null, GCMParameterSpec(TAG_BITS, iv))
            val text = String(cipher.doFinal(bytes, IV_SIZE, bytes.size - IV_SIZE), Charsets.UTF_8)
            val email = text.substringBefore('\n')
            val password = text.substringAfter('\n', "")
            if (email.isEmpty() || password.isEmpty()) null else email to password
        } catch (e: Exception) {
            // A key lost with a backup restore, for example: the account is
            // forgotten, the diver signs in again.
            null
        }
    }

    fun write(email: String, password: String) {
        val cipher = Cipher.getInstance(TRANSFORMATION)
        cipher.init(Cipher.ENCRYPT_MODE, key() ?: createKey())
        val sealed = cipher.iv + cipher.doFinal("$email\n$password".toByteArray(Charsets.UTF_8))
        val tmp = File(file.parentFile, "$FILE_NAME.tmp")
        tmp.writeBytes(sealed)
        if (!tmp.renameTo(file)) {
            tmp.delete()
            throw IllegalStateException("CREDENTIALS_NOT_SAVED")
        }
    }

    fun delete() {
        file.delete()
        try {
            keyStore().deleteEntry(KEY_ALIAS)
        } catch (e: Exception) {
            // Nothing to delete.
        }
    }

    private fun keyStore(): KeyStore = KeyStore.getInstance(ANDROID_KEYSTORE).apply { load(null) }

    private fun key(): SecretKey? = (keyStore().getEntry(KEY_ALIAS, null) as? KeyStore.SecretKeyEntry)?.secretKey

    private fun createKey(): SecretKey {
        val generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, ANDROID_KEYSTORE)
        generator.init(
            KeyGenParameterSpec.Builder(KEY_ALIAS, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setKeySize(256)
                .build(),
        )
        return generator.generateKey()
    }

    private companion object {
        const val ANDROID_KEYSTORE = "AndroidKeyStore"
        const val KEY_ALIAS = "opendives-cloud-account"
        const val FILE_NAME = "cloud-account.bin"
        const val TRANSFORMATION = "AES/GCM/NoPadding"
        const val IV_SIZE = 12
        const val TAG_BITS = 128
    }
}
