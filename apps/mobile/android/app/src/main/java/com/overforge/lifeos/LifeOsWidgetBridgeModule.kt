package com.overforge.lifeos

import android.content.Context
import android.content.Intent
import android.provider.Settings
import android.util.Log
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import org.json.JSONObject

/**
 * LifeOsWidgetBridgeModule
 * 
 * Production-hardened native bridge for LifeOS Android Ambient Widget.
 * Responsibilities:
 * 1. Validates and ingests typed IWidgetPresentationDTO payloads from React Native.
 * 2. Persists validated DTO into native SharedPreferences (lifeos_surface_prefs).
 * 3. Enforces safe fallback on malformed or incompatible payloads (schemaVersion != 1).
 * 4. Manages hardware-backed Keystore credential vault (LifeOsSecureVault).
 * 5. Broadcasts ACTION_WIDGET_UPDATE to GlanceWidgetProvider.
 */
class LifeOsWidgetBridgeModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {

    companion object {
        private const val TAG = "LifeOsWidgetBridge"
        const val PREFS_NAME = GlanceWidgetProvider.PREFS_NAME
        
        // Canonical Preference Keys
        const val KEY_DTO_JSON = "widget_presentation_dto"
        const val KEY_DISPLAY_STATE = "display_state"
        const val KEY_VISUAL_INTENT = "visual_intent"
        const val KEY_PRIMARY_TITLE = "primary_title"
        const val KEY_SECONDARY_TEXT = "secondary_text"
        const val KEY_BADGE_TEXT = "badge_text"
        
        // Temporal Telemetry Keys
        const val KEY_NEXT_START_MS = "next_commitment_start_ms"
        const val KEY_NEXT_TITLE = "next_commitment_title"
        
        // Active Telemetry Keys
        const val KEY_ACTIVE_ENTITY_ID = "active_entity_id"
        const val KEY_ACTIVE_STARTED_AT_MS = "active_started_at_ms"
        const val KEY_ACTIVE_PLANNED_MINS = "active_planned_duration_mins"
        const val KEY_ACTIVE_IDEMPOTENCY_SEED = "active_idempotency_seed"
        
        // Upcoming Telemetry Keys
        const val KEY_UPCOMING_ENTITY_ID = "upcoming_entity_id"
        const val KEY_UPCOMING_STARTS_AT_MS = "upcoming_starts_at_ms"
        const val KEY_UPCOMING_IDEMPOTENCY_SEED = "upcoming_idempotency_seed"
        
        // Allowed Actions
        const val KEY_CAN_START = "can_start"
        const val KEY_CAN_COMPLETE = "can_complete"
        const val KEY_CAN_PAUSE = "can_pause"
        const val KEY_CAN_EXTEND = "can_extend"
        
        const val KEY_CANONICAL_QUEUE = "canonical_pending_actions"
        const val KEY_CANONICAL_QUEUE_SHADOW = "canonical_pending_actions_shadow"
        const val KEY_UPDATED_AT_MS = "updated_at_ms"
    }

    override fun getName(): String {
        return "LifeOsWidgetBridge"
    }

    /**
     * Ingests and validates typed IWidgetPresentationDTO JSON payload.
     * Guaranteed safe: Never crashes the launcher or app.
     */
    @ReactMethod
    fun updateWidgetPresentation(dtoJson: String, promise: Promise) {
        try {
            val context = reactApplicationContext
            val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            val editor = prefs.edit()

            var isValid = false
            var displayState = "CLEAR"
            var visualIntent = "CALM"
            var primaryTitle = "You're clear."
            var secondaryText = ""
            var badgeText = "CLEAR"
            
            var nextStartMs: Long = 0
            var nextTitle = ""

            var activeEntityId = ""
            var activeStartedAtMs: Long = 0
            var activePlannedMins = 0
            var activeSeed = ""

            var upcomingEntityId = ""
            var upcomingStartsAtMs: Long = 0
            var upcomingSeed = ""

            var canStart = false
            var canComplete = false
            var canPause = false
            var canExtend = false

            try {
                val json = JSONObject(dtoJson)
                val schemaVersion = json.optInt("schemaVersion", 0)

                if (schemaVersion == 1) {
                    displayState = json.getString("displayState")
                    visualIntent = json.getString("visualIntent")
                    primaryTitle = json.getString("primaryTitle")
                    secondaryText = json.optString("secondaryText", "")
                    badgeText = json.optString("badgeText", "")

                    val temporal = json.optJSONObject("temporalContext")
                    if (temporal != null) {
                        nextStartMs = temporal.optLong("nextCommitmentStartMs", 0)
                        nextTitle = temporal.optString("nextCommitmentTitle", "")
                    }

                    val active = json.optJSONObject("activeContext")
                    if (active != null) {
                        activeEntityId = active.optString("entityId", "")
                        activeStartedAtMs = active.optLong("startedAtMs", 0)
                        activePlannedMins = active.optInt("plannedDurationMinutes", 0)
                        activeSeed = active.optString("idempotencySeed", "")
                    }

                    val upcoming = json.optJSONObject("upcomingContext")
                    if (upcoming != null) {
                        upcomingEntityId = upcoming.optString("entityId", "")
                        upcomingStartsAtMs = upcoming.optLong("startsAtMs", 0)
                        upcomingSeed = upcoming.optString("idempotencySeed", "")
                    }

                    val actions = json.optJSONObject("allowedActions")
                    if (actions != null) {
                        canStart = actions.optBoolean("canStart", false)
                        canComplete = actions.optBoolean("canComplete", false)
                        canPause = actions.optBoolean("canPause", false)
                        canExtend = actions.optBoolean("canExtend", false)
                    }

                    editor.putString(KEY_DTO_JSON, dtoJson)
                    isValid = true
                } else {
                    Log.w(TAG, "Incompatible DTO schemaVersion: $schemaVersion. Applying safe CLEAR fallback.")
                }
            } catch (jsonErr: Throwable) {
                Log.e(TAG, "Malformed DTO payload received. Applying safe fallback.", jsonErr)
            }

            if (!isValid) {
                // Safe Fallback Ingestion Rule
                displayState = "CLEAR"
                visualIntent = "CALM"
                primaryTitle = "You're clear."
                secondaryText = "Syncing..."
                badgeText = "CLEAR"
                editor.putString(KEY_DTO_JSON, "")
            }

            editor
                .putString(KEY_DISPLAY_STATE, displayState)
                .putString(KEY_VISUAL_INTENT, visualIntent)
                .putString(KEY_PRIMARY_TITLE, primaryTitle)
                .putString(KEY_SECONDARY_TEXT, secondaryText)
                .putString(KEY_BADGE_TEXT, badgeText)
                .putLong(KEY_NEXT_START_MS, nextStartMs)
                .putString(KEY_NEXT_TITLE, nextTitle)
                .putString(KEY_ACTIVE_ENTITY_ID, activeEntityId)
                .putLong(KEY_ACTIVE_STARTED_AT_MS, activeStartedAtMs)
                .putInt(KEY_ACTIVE_PLANNED_MINS, activePlannedMins)
                .putString(KEY_ACTIVE_IDEMPOTENCY_SEED, activeSeed)
                .putString(KEY_UPCOMING_ENTITY_ID, upcomingEntityId)
                .putLong(KEY_UPCOMING_STARTS_AT_MS, upcomingStartsAtMs)
                .putString(KEY_UPCOMING_IDEMPOTENCY_SEED, upcomingSeed)
                .putBoolean(KEY_CAN_START, canStart)
                .putBoolean(KEY_CAN_COMPLETE, canComplete)
                .putBoolean(KEY_CAN_PAUSE, canPause)
                .putBoolean(KEY_CAN_EXTEND, canExtend)
                .putLong(KEY_UPDATED_AT_MS, System.currentTimeMillis())
                .commit()

            // Trigger broadcast to refresh all active widget instances
            val updateIntent = Intent(context, GlanceWidgetProvider::class.java).apply {
                action = GlanceWidgetProvider.ACTION_WIDGET_UPDATE
            }
            context.sendBroadcast(updateIntent)

            promise.resolve(true)
        } catch (e: Exception) {
            Log.e(TAG, "Unexpected error updating widget presentation", e)
            promise.reject("WIDGET_UPDATE_ERROR", e.localizedMessage, e)
        }
    }

    /**
     * Stores session credentials into hardware-backed Android Keystore vault.
     */
    @ReactMethod
    fun storeSecureSession(token: String, userId: String, expiresAtMs: Double, promise: Promise) {
        try {
            val context = reactApplicationContext
            val deviceBindingId = Settings.Secure.getString(context.contentResolver, Settings.Secure.ANDROID_ID) ?: ""
            val success = LifeOsSecureVault.storeSession(
                context,
                token,
                userId,
                expiresAtMs.toLong(),
                deviceBindingId
            )
            if (success) {
                promise.resolve(true)
            } else {
                promise.reject("KEYSTORE_ERROR", "Failed to store session in Android Keystore vault")
            }
        } catch (e: Exception) {
            promise.reject("KEYSTORE_ERROR", e.localizedMessage, e)
        }
    }

    /**
     * Wipes session credentials from Android Keystore vault upon logout.
     */
    @ReactMethod
    fun clearSecureSession(promise: Promise) {
        try {
            val context = reactApplicationContext
            val success = LifeOsSecureVault.clearSession(context)
            promise.resolve(success)
        } catch (e: Exception) {
            promise.reject("KEYSTORE_CLEAR_ERROR", e.localizedMessage, e)
        }
    }

    /**
     * Checks if a valid session exists in Android Keystore vault without exposing token.
     */
    @ReactMethod
    fun getSecureSessionStatus(promise: Promise) {
        try {
            val context = reactApplicationContext
            val session = LifeOsSecureVault.getActiveSession(context)
            val map = Arguments.createMap().apply {
                putBoolean("hasSession", session != null)
                putString("userId", session?.userId ?: "")
                putBoolean("isExpired", session?.isExpired ?: true)
            }
            promise.resolve(map)
        } catch (e: Exception) {
            promise.reject("KEYSTORE_STATUS_ERROR", e.localizedMessage, e)
        }
    }

    /**
     * Enqueues an action envelope into the single canonical offline store.
     */
    @ReactMethod
    fun enqueueCanonicalOfflineAction(envelopeJson: String, promise: Promise) {
        try {
            val context = reactApplicationContext
            val envelope = JSONObject(envelopeJson)
            val idempotencyKey = envelope.getString("idempotencyKey")

            val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            val queueRaw = prefs.getString(KEY_CANONICAL_QUEUE, "[]") ?: "[]"
            val queue = org.json.JSONArray(queueRaw)

            // Deduplication
            for (i in 0 until queue.length()) {
                val item = queue.getJSONObject(i)
                if (item.optString("idempotencyKey") == idempotencyKey) {
                    promise.resolve(false)
                    return
                }
            }

            val queueItem = JSONObject().apply {
                put("idempotencyKey", idempotencyKey)
                put("createdAtMs", System.currentTimeMillis())
                put("status", "PENDING")
                put("leaseExpiresAtMs", 0L)
                put("envelope", envelope)
            }

            prefs.edit().putString(KEY_CANONICAL_QUEUE_SHADOW, queueRaw).commit()
            queue.put(queueItem)
            prefs.edit().putString(KEY_CANONICAL_QUEUE, queue.toString()).commit()

            LifeOsQueueReplayWorker.scheduleReplay(context)
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("OFFLINE_QUEUE_ERROR", e.localizedMessage, e)
        }
    }

    /**
     * Schedules WorkManager replay for canonical offline queue.
     */
    @ReactMethod
    fun scheduleQueueReplay(promise: Promise) {
        try {
            LifeOsQueueReplayWorker.scheduleReplay(reactApplicationContext)
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("REPLAY_SCHEDULE_ERROR", e.localizedMessage, e)
        }
    }

    /**
     * Returns count of pending offline actions.
     */
    @ReactMethod
    fun getCanonicalOfflineQueueCount(promise: Promise) {
        try {
            val prefs = reactApplicationContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            val queueRaw = prefs.getString(KEY_CANONICAL_QUEUE, "[]") ?: "[]"
            val queue = org.json.JSONArray(queueRaw)
            promise.resolve(queue.length())
        } catch (e: Exception) {
            promise.reject("QUEUE_COUNT_ERROR", e.localizedMessage, e)
        }
    }

    /**
     * Legacy compatibility method forwarding to fallback state.
     */
    @ReactMethod
    fun updateWidgetState(title: String, subtitle: String, mode: String, count: Int, promise: Promise) {
        try {
            val fallbackJson = JSONObject().apply {
                put("schemaVersion", 1)
                put("projectionVersion", 1)
                put("generatedAtMs", System.currentTimeMillis())
                put("displayState", if (mode == "ACTIVE") "ACTIVE" else "CLEAR")
                put("visualIntent", if (mode == "ACTIVE") "ACTIVE" else "CALM")
                put("primaryTitle", title)
                put("secondaryText", subtitle)
                put("badgeText", mode)
                put("allowedActions", JSONObject().apply {
                    put("canStart", false)
                    put("canComplete", mode == "ACTIVE")
                    put("canPause", false)
                    put("canExtend", false)
                })
            }.toString()
            updateWidgetPresentation(fallbackJson, promise)
        } catch (e: Exception) {
            promise.reject("WIDGET_LEGACY_ERROR", e.localizedMessage, e)
        }
    }

    /**
     * Dismisses the dedicated AvenActivity transparent surface smoothly.
     */
    @ReactMethod
    fun dismissAvenSurface(promise: Promise) {
        try {
            val activity = reactApplicationContext.currentActivity
            activity?.runOnUiThread {
                activity.finish()
                activity.overridePendingTransition(0, android.R.anim.fade_out)
            }
            promise.resolve(activity != null)
        } catch (e: Exception) {
            promise.reject("DISMISS_ERROR", e.localizedMessage, e)
        }
    }
}
