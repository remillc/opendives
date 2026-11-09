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
 * A text kept in the app's private storage, encrypted with AES-GCM by a key
 * that never leaves the Android Keystore (hardware-backed when available).
 * Only the ciphertext is stored. One alias and one file per secret.
 */
internal class SealedFile(context: Context, private val keyAlias: String, fileName: String) {
    private val name = fileName
    private val file = File(context.filesDir, fileName)

    /** The text, or null when there is none or it cannot be decrypted (a key lost with a restore). */
    fun read(): String? {
        if (!file.exists()) return null
        return try {
            val bytes = file.readBytes()
            val iv = bytes.copyOfRange(0, IV_SIZE)
            val cipher = Cipher.getInstance(TRANSFORMATION)
            cipher.init(Cipher.DECRYPT_MODE, key() ?: return null, GCMParameterSpec(TAG_BITS, iv))
            String(cipher.doFinal(bytes, IV_SIZE, bytes.size - IV_SIZE), Charsets.UTF_8)
        } catch (e: Exception) {
            null
        }
    }

    fun write(text: String) {
        val cipher = Cipher.getInstance(TRANSFORMATION)
        cipher.init(Cipher.ENCRYPT_MODE, key() ?: createKey())
        val sealed = cipher.iv + cipher.doFinal(text.toByteArray(Charsets.UTF_8))
        val tmp = File(file.parentFile, "$name.tmp")
        tmp.writeBytes(sealed)
        if (!tmp.renameTo(file)) {
            tmp.delete()
            throw IllegalStateException("CREDENTIALS_NOT_SAVED")
        }
    }

    fun delete() {
        file.delete()
        File(file.parentFile, "$name.tmp").delete()
        try {
            keyStore().deleteEntry(keyAlias)
        } catch (e: Exception) {
            // Nothing to delete.
        }
    }

    private fun keyStore(): KeyStore = KeyStore.getInstance(ANDROID_KEYSTORE).apply { load(null) }

    private fun key(): SecretKey? = (keyStore().getEntry(keyAlias, null) as? KeyStore.SecretKeyEntry)?.secretKey

    private fun createKey(): SecretKey {
        val generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, ANDROID_KEYSTORE)
        generator.init(
            KeyGenParameterSpec.Builder(keyAlias, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setKeySize(256)
                .build(),
        )
        return generator.generateKey()
    }

    private companion object {
        const val ANDROID_KEYSTORE = "AndroidKeyStore"
        const val TRANSFORMATION = "AES/GCM/NoPadding"
        const val IV_SIZE = 12
        const val TAG_BITS = 128
    }
}
