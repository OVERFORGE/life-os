package com.overforge.lifeos

import android.content.Context
import android.provider.Settings
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import android.util.Log
import org.json.JSONObject
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/**
 * LifeOsSecureVault
 * 
 * Android Keystore-backed credential vault.
 * Provides hardware-backed AES-256-GCM encryption for bearer tokens and session metadata.
 * Enables native headless components (WidgetActionReceiver) to retrieve credentials
 * securely without waking the React Native JavaScript engine.
 */
object LifeOsSecureVault {

    private const val TAG = "LifeOsSecureVault"
    private const val ANDROID_KEYSTORE = "AndroidKeyStore"
    private const val KEY_ALIAS = "lifeos_auth_key"
    private const val PREFS_NAME = "lifeos_secure_vault"
    private const val KEY_ENCRYPTED_DATA = "enc_session_payload"
    private const val KEY_IV = "enc_session_iv"
    private const val GCM_TAG_LENGTH = 128
    private const val TRANSFORMATION = "AES/GCM/NoPadding"

    data class ActiveSession(
        val token: String,
        val userId: String,
        val expiresAtMs: Long,
        val deviceBindingId: String
    ) {
        val isExpired: Boolean
            get() = expiresAtMs <= System.currentTimeMillis()
    }

    /**
     * Retrieves or generates the hardware-backed AES-256 key from Android Keystore.
     */
    private fun getOrCreateSecretKey(): SecretKey {
        val keyStore = KeyStore.getInstance(ANDROID_KEYSTORE).apply { load(null) }
        
        if (keyStore.containsAlias(KEY_ALIAS)) {
            val keyEntry = keyStore.getEntry(KEY_ALIAS, null) as? KeyStore.SecretKeyEntry
            if (keyEntry != null) {
                return keyEntry.secretKey
            }
        }

        val keyGenerator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, ANDROID_KEYSTORE)
        val spec = KeyGenParameterSpec.Builder(
            KEY_ALIAS,
            KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT
        )
            .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
            .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
            .setKeySize(256)
            .build()

        keyGenerator.init(spec)
        return keyGenerator.generateKey()
    }

    /**
     * Encrypts and securely persists the session credentials.
     */
    @Synchronized
    fun storeSession(
        context: Context,
        token: String,
        userId: String,
        expiresAtMs: Long,
        deviceBindingId: String
    ): Boolean {
        return try {
            val secretKey = getOrCreateSecretKey()
            val cipher = Cipher.getInstance(TRANSFORMATION)
            cipher.init(Cipher.ENCRYPT_MODE, secretKey)
            val iv = cipher.iv

            val payload = JSONObject().apply {
                put("token", token)
                put("userId", userId)
                put("expiresAtMs", expiresAtMs)
                put("deviceBindingId", deviceBindingId)
            }.toString()

            val ciphertext = cipher.doFinal(payload.toByteArray(Charsets.UTF_8))

            val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            prefs.edit()
                .putString(KEY_ENCRYPTED_DATA, Base64.encodeToString(ciphertext, Base64.NO_WRAP))
                .putString(KEY_IV, Base64.encodeToString(iv, Base64.NO_WRAP))
                .commit()

            Log.d(TAG, "Session securely stored in Android Keystore vault for user: $userId")
            true
        } catch (t: Throwable) {
            Log.e(TAG, "Failed to store session in Keystore vault", t)
            false
        }
    }

    /**
     * Decrypts and retrieves the active session from Keystore.
     * Returns null if no session exists, if decryption fails, if expired, or if device binding mismatch.
     */
    @Synchronized
    fun getActiveSession(context: Context): ActiveSession? {
        return try {
            val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            val encDataB64 = prefs.getString(KEY_ENCRYPTED_DATA, null) ?: return null
            val ivB64 = prefs.getString(KEY_IV, null) ?: return null

            val ciphertext = Base64.decode(encDataB64, Base64.NO_WRAP)
            val iv = Base64.decode(ivB64, Base64.NO_WRAP)

            val secretKey = getOrCreateSecretKey()
            val cipher = Cipher.getInstance(TRANSFORMATION)
            val spec = GCMParameterSpec(GCM_TAG_LENGTH, iv)
            cipher.init(Cipher.DECRYPT_MODE, secretKey, spec)

            val plaintext = cipher.doFinal(ciphertext)
            val json = JSONObject(String(plaintext, Charsets.UTF_8))

            val token = json.getString("token")
            val userId = json.getString("userId")
            val expiresAtMs = json.getLong("expiresAtMs")
            val deviceBindingId = json.optString("deviceBindingId", "")

            // Validate expiration
            if (expiresAtMs <= System.currentTimeMillis()) {
                Log.w(TAG, "Active session in vault has expired at $expiresAtMs (now=${System.currentTimeMillis()})")
                return null
            }

            // Validate device binding if present
            val currentDeviceId = Settings.Secure.getString(context.contentResolver, Settings.Secure.ANDROID_ID)
            if (deviceBindingId.isNotEmpty() && deviceBindingId != currentDeviceId) {
                Log.e(TAG, "Device binding mismatch in Keystore vault! Session rejected.")
                return null
            }

            ActiveSession(token, userId, expiresAtMs, deviceBindingId)
        } catch (t: Throwable) {
            Log.e(TAG, "Failed to decrypt active session from Keystore vault", t)
            null
        }
    }

    /**
     * Completely zeroes and wipes stored session credentials.
     */
    @Synchronized
    fun clearSession(context: Context): Boolean {
        return try {
            val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            prefs.edit().clear().commit()
            Log.d(TAG, "Session cleared from Keystore vault.")
            true
        } catch (t: Throwable) {
            Log.e(TAG, "Failed to clear session from vault", t)
            false
        }
    }
}
