package com.overforge.lifeos

import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.Promise

/**
 * AvenWakeWordBridgeModule
 *
 * React Native ↔ Native bridge for controlling the AvenWakeWordService.
 * Exposes start/stop/status methods to the TypeScript MobileWakeWordService.
 *
 * Invariant: This module never transmits audio data to JS. It only controls
 * the native foreground service lifecycle.
 */
class AvenWakeWordBridgeModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String = "AvenWakeWordBridge"

    @ReactMethod
    fun startWakeWordService(promise: Promise) {
        try {
            AvenWakeWordService.start(reactApplicationContext)
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("WAKE_START_ERROR", "Failed to start wake word service", e)
        }
    }

    @ReactMethod
    fun stopWakeWordService(promise: Promise) {
        try {
            AvenWakeWordService.stop(reactApplicationContext)
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("WAKE_STOP_ERROR", "Failed to stop wake word service", e)
        }
    }

    @ReactMethod
    fun isWakeWordServiceRunning(promise: Promise) {
        // Check SharedPreferences for wake-word enabled state
        val prefs = reactApplicationContext.getSharedPreferences(
            "aven_wake_word_prefs", 0
        )
        promise.resolve(prefs.getBoolean("wake_word_enabled", false))
    }
}
