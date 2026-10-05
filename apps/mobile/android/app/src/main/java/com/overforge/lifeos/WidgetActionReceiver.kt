package com.overforge.lifeos

import android.appwidget.AppWidgetManager
import android.content.BroadcastReceiver
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.os.Handler
import android.os.Looper
import android.util.Log
import android.view.View
import android.widget.RemoteViews
import org.json.JSONArray
import org.json.JSONObject
import java.io.BufferedReader
import java.io.InputStreamReader
import java.io.OutputStreamWriter
import java.net.HttpURLConnection
import java.net.URL
import java.nio.charset.StandardCharsets
import java.security.MessageDigest
import java.util.UUID
import java.util.concurrent.Executors

/**
 * WidgetActionReceiver
 * 
 * Canonical Headless Action Ingress for LifeOS Android Ambient Widget.
 * Responsibilities:
 * 1. Receives button click broadcasts (ACTION_HEADLESS_DISPATCH) directly from launcher RemoteViews.
 * 2. Renders immediate provisional UI ("Completing…") without waiting for network.
 * 3. Enforces 5000ms watchdog timer (prevents infinite "Completing…" state).
 * 4. Authenticates via hardware-backed LifeOsSecureVault (Android Keystore).
 * 5. Computes byte-for-byte canonical SHA-256 idempotency key.
 * 6. Dispatches ISurfaceActionEnvelope directly to POST /api/kernel/dispatch.
 * 7. Evaluates KernelExecutionResult.outcome as the semantic execution oracle.
 * 8. Reconciles widget UI deterministically from kernel reprojection.
 */
class WidgetActionReceiver : BroadcastReceiver() {

    companion object {
        private const val TAG = "WidgetActionReceiver"
        const val ACTION_HEADLESS_DISPATCH = "com.overforge.lifeos.ACTION_HEADLESS_DISPATCH"
        const val PREFS_NAME = GlanceWidgetProvider.PREFS_NAME
        const val KEY_CANONICAL_QUEUE = "canonical_pending_actions"
        const val KEY_CANONICAL_QUEUE_SHADOW = "canonical_pending_actions_shadow"
        const val DEFAULT_API_URL = "http://10.0.2.2:3000/api"

        private val executor = Executors.newSingleThreadExecutor()

        /**
         * Computes canonical logical idempotency key.
         * Byte-for-byte compatible with TypeScript computeSurfaceActionIdempotencyKey():
         * SHA-256("${userId}:${actionType}:${entityId}:${seed}")
         */
        fun computeCanonicalIdempotencyKey(
            userId: String,
            actionType: String,
            entityId: String,
            seed: String
        ): String {
            val raw = "${userId.trim()}:${actionType.trim()}:${entityId.trim()}:${seed.trim()}"
            val digest = MessageDigest.getInstance("SHA-256")
            val hashBytes = digest.digest(raw.toByteArray(StandardCharsets.UTF_8))
            return hashBytes.joinToString("") { "%02x".format(it) }
        }
    }

    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != ACTION_HEADLESS_DISPATCH) return

        val actionType = intent.getStringExtra("action_type") ?: return
        val entityId = intent.getStringExtra("entity_id") ?: ""
        val seed = intent.getStringExtra("idempotency_seed") ?: entityId

        Log.d(TAG, "Headless action triggered: $actionType for entity: $entityId (seed=$seed)")

        // 1. Render Immediate Provisional UI ("Completing…")
        renderProvisionalState(context, actionType)

        val pendingResult = goAsync()
        val isFinished = java.util.concurrent.atomic.AtomicBoolean(false)
        fun finishSafely() {
            if (isFinished.compareAndSet(false, true)) {
                try {
                    pendingResult.finish()
                } catch (t: Throwable) {
                    Log.e(TAG, "Error finishing pendingResult", t)
                }
            }
        }

        // 2. Schedule 5000ms Watchdog Timer to prevent UI freeze
        val mainHandler = Handler(Looper.getMainLooper())
        var isCompleted = false

        val watchdogRunnable = Runnable {
            if (!isCompleted) {
                Log.w(TAG, "Watchdog timer expired (5000ms) for action: $actionType. Transitioning to queued state.")
                renderTruthfulState(context, "Offline • Queued", "#88888E")
            }
        }
        mainHandler.postDelayed(watchdogRunnable, 5000)

        executor.execute {
            try {
                // 3. Credential Check via Hardware-Backed LifeOsSecureVault with SharedPreferences Fallback
                var userId: String? = null
                var token: String? = null

                val session = LifeOsSecureVault.getActiveSession(context)
                if (session != null && !session.isExpired) {
                    userId = session.userId
                    token = session.token
                } else {
                    // Check fallback preferences if Keystore vault has not been seeded yet
                    val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
                    val fallbackToken = prefs.getString("auth_token", null)
                    val fallbackUserId = prefs.getString("auth_user_id", "usr_current") ?: "usr_current"
                    val fallbackExpires = prefs.getLong("auth_expires_at_ms", 0L)
                    if (!fallbackToken.isNullOrEmpty() && (fallbackExpires == 0L || fallbackExpires > System.currentTimeMillis())) {
                        userId = fallbackUserId
                        token = fallbackToken
                    }
                }

                if (userId.isNullOrEmpty() || token.isNullOrEmpty()) {
                    Log.w(TAG, "No valid authenticated session in vault or preferences. Transitioning to AUTH_EXPIRED.")
                    mainHandler.removeCallbacks(watchdogRunnable)
                    isCompleted = true
                    renderTruthfulState(context, "Session Expired • Tap to sign in", "#E8414A")
                    return@execute
                }

                // 4. Compute Byte-for-Byte Canonical Idempotency Key
                val idempotencyKey = computeCanonicalIdempotencyKey(userId, actionType, entityId, seed)
                val actionId = UUID.randomUUID().toString()

                val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
                val observedVersion = prefs.getInt("projection_version", 1)

                val envelope = JSONObject().apply {
                    put("envelopeVersion", 1)
                    put("actionId", actionId)
                    put("idempotencyKey", idempotencyKey)
                    put("surfaceType", "ANDROID_WIDGET")
                    put("actionType", actionType)
                    put("entityId", entityId)
                    put("userId", userId)
                    put("timestampMs", System.currentTimeMillis())
                    put("observedProjectionVersion", observedVersion)
                    put("parameters", JSONObject())
                }

                // 5. Check Network Connectivity
                if (!isNetworkAvailable(context)) {
                    Log.i(TAG, "Network unavailable. Persisting action to canonical offline queue.")
                    enqueueOfflineAction(context, idempotencyKey, envelope)
                    mainHandler.removeCallbacks(watchdogRunnable)
                    isCompleted = true
                    renderTruthfulState(context, "Offline • Queued", "#88888E")
                    return@execute
                }

                // 6. Dispatch HTTP POST to /api/kernel/dispatch
                val baseUrl = prefs.getString("api_base_url", DEFAULT_API_URL) ?: DEFAULT_API_URL
                val dispatchUrl = if (baseUrl.endsWith("/api")) "$baseUrl/kernel/dispatch" else "$baseUrl/api/kernel/dispatch"

                val result = executeDispatch(dispatchUrl, token, envelope)

                mainHandler.removeCallbacks(watchdogRunnable)
                isCompleted = true

                // 7. Evaluate Kernel Execution Result Oracle
                when (result.httpCode) {
                    200 -> {
                        val outcome = result.outcome
                        Log.i(TAG, "Kernel execution outcome: $outcome")

                        when (outcome) {
                            "EXECUTE_COMMITTED", "EXECUTE_WITH_UNDO", "REJECTED_IDEMPOTENT_DUPLICATE" -> {
                                // Authoritative Success: Apply reprojection
                                applyReprojectionOrClear(context, result.reprojectionJson)
                            }
                            "REJECTED_STALE" -> {
                                Log.w(TAG, "Action rejected as stale by kernel.")
                                renderTruthfulState(context, "Task already modified", "#88888E")
                            }
                            "CONFIRMATION_REQUIRED" -> {
                                Log.w(TAG, "Action requires confirmation.")
                                renderTruthfulState(context, "Confirmation needed in Aven", "#88888E")
                            }
                            else -> {
                                Log.w(TAG, "Unknown kernel outcome: $outcome")
                                renderTruthfulState(context, "Action processed", "#88888E")
                            }
                        }
                    }
                    401, 403 -> {
                        Log.e(TAG, "Authentication failed with HTTP ${result.httpCode}. Invalidating session.")
                        LifeOsSecureVault.clearSession(context)
                        renderTruthfulState(context, "Session Expired • Tap to sign in", "#E8414A")
                    }
                    else -> {
                        Log.e(TAG, "Network dispatch failed with HTTP ${result.httpCode}. Enqueuing offline.")
                        enqueueOfflineAction(context, idempotencyKey, envelope)
                        renderTruthfulState(context, "Offline • Queued", "#88888E")
                    }
                }
            } catch (t: Throwable) {
                Log.e(TAG, "Unhandled exception during headless action dispatch", t)
                mainHandler.removeCallbacks(watchdogRunnable)
                isCompleted = true
                renderTruthfulState(context, "Offline • Queued", "#88888E")
            } finally {
                finishSafely()
            }
        }
    }

    private fun renderProvisionalState(context: Context, actionType: String) {
        try {
            val appWidgetManager = AppWidgetManager.getInstance(context)
            val thisWidget = ComponentName(context, GlanceWidgetProvider::class.java)
            val allIds = appWidgetManager.getAppWidgetIds(thisWidget)
            val views = RemoteViews(context.packageName, R.layout.widget_glance_layout)

            val pendingText = when (actionType) {
                "start_execution" -> "Starting…"
                "complete_task" -> "Completing…"
                "pause_execution" -> "Pausing…"
                "defer_execution" -> "Extending…"
                else -> "Updating…"
            }

            // Update main title to show immediate pending progress
            views.setTextViewText(R.id.widget_active_title, pendingText)
            views.setTextViewText(R.id.widget_upcoming_title, pendingText)
            views.setTextViewText(R.id.txt_action_done, pendingText)
            views.setTextViewText(R.id.txt_action_start, pendingText)

            for (id in allIds) {
                appWidgetManager.partiallyUpdateAppWidget(id, views)
            }
        } catch (t: Throwable) {
            Log.e(TAG, "Error rendering provisional state", t)
        }
    }

    private fun renderTruthfulState(context: Context, statusMessage: String, badgeColorHex: String) {
        try {
            val appWidgetManager = AppWidgetManager.getInstance(context)
            val thisWidget = ComponentName(context, GlanceWidgetProvider::class.java)
            val allIds = appWidgetManager.getAppWidgetIds(thisWidget)
            val views = RemoteViews(context.packageName, R.layout.widget_glance_layout)

            views.setTextViewText(R.id.widget_clear_title, statusMessage)
            views.setTextViewText(R.id.widget_active_title, statusMessage)
            views.setTextViewText(R.id.widget_upcoming_title, statusMessage)
            views.setTextViewText(R.id.widget_proposal_title, statusMessage)

            // Reset action buttons back from provisional pending state
            views.setTextViewText(R.id.txt_action_start, "Start")
            views.setTextViewText(R.id.txt_action_done, "Done")

            for (id in allIds) {
                appWidgetManager.partiallyUpdateAppWidget(id, views)
            }
        } catch (t: Throwable) {
            Log.e(TAG, "Error rendering truthful status state", t)
        }
    }

    private fun applyReprojectionOrClear(context: Context, reprojectionJson: String?) {
        val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        val editor = prefs.edit()

        if (!reprojectionJson.isNullOrEmpty()) {
            try {
                val rep = JSONObject(reprojectionJson)
                val active = rep.optJSONObject("activeExecution")
                val upcoming = rep.optJSONObject("upcomingCommitment")

                if (active != null && active.optString("status") == "ACTIVE") {
                    editor.putString(LifeOsWidgetBridgeModule.KEY_DISPLAY_STATE, "ACTIVE")
                    editor.putString(LifeOsWidgetBridgeModule.KEY_VISUAL_INTENT, "ACTIVE")
                    editor.putString(LifeOsWidgetBridgeModule.KEY_PRIMARY_TITLE, active.optString("title", "Active Task"))
                    editor.putLong(LifeOsWidgetBridgeModule.KEY_ACTIVE_STARTED_AT_MS, active.optLong("startedAtMs", System.currentTimeMillis()))
                    editor.putInt(LifeOsWidgetBridgeModule.KEY_ACTIVE_PLANNED_MINS, active.optInt("plannedDurationMinutes", 30))
                    editor.putBoolean(LifeOsWidgetBridgeModule.KEY_CAN_COMPLETE, true)
                    editor.putBoolean(LifeOsWidgetBridgeModule.KEY_CAN_START, false)
                } else if (upcoming != null) {
                    editor.putString(LifeOsWidgetBridgeModule.KEY_DISPLAY_STATE, "UPCOMING")
                    editor.putString(LifeOsWidgetBridgeModule.KEY_VISUAL_INTENT, "UPCOMING")
                    editor.putString(LifeOsWidgetBridgeModule.KEY_PRIMARY_TITLE, upcoming.optString("title", "Upcoming Task"))
                    editor.putLong(LifeOsWidgetBridgeModule.KEY_NEXT_START_MS, upcoming.optLong("startsAtMs", 0L))
                    editor.putBoolean(LifeOsWidgetBridgeModule.KEY_CAN_START, true)
                    editor.putBoolean(LifeOsWidgetBridgeModule.KEY_CAN_COMPLETE, false)
                } else {
                    // CLEAR state
                    editor.putString(LifeOsWidgetBridgeModule.KEY_DISPLAY_STATE, "CLEAR")
                    editor.putString(LifeOsWidgetBridgeModule.KEY_VISUAL_INTENT, "CALM")
                    editor.putString(LifeOsWidgetBridgeModule.KEY_PRIMARY_TITLE, "You're clear.")
                    editor.putString(LifeOsWidgetBridgeModule.KEY_SECONDARY_TEXT, "")
                    editor.putString(LifeOsWidgetBridgeModule.KEY_BADGE_TEXT, "CLEAR")
                    editor.putBoolean(LifeOsWidgetBridgeModule.KEY_CAN_START, false)
                    editor.putBoolean(LifeOsWidgetBridgeModule.KEY_CAN_COMPLETE, false)
                    editor.putBoolean(LifeOsWidgetBridgeModule.KEY_CAN_PAUSE, false)
                    editor.putBoolean(LifeOsWidgetBridgeModule.KEY_CAN_EXTEND, false)
                }
            } catch (t: Throwable) {
                Log.e(TAG, "Failed to parse reprojection payload. Applying safe CLEAR.", t)
                applySafeClear(editor)
            }
        } else {
            applySafeClear(editor)
        }

        editor.commit()

        // Trigger widget update broadcast
        val updateIntent = Intent(context, GlanceWidgetProvider::class.java).apply {
            action = GlanceWidgetProvider.ACTION_WIDGET_UPDATE
        }
        context.sendBroadcast(updateIntent)
    }

    private fun applySafeClear(editor: android.content.SharedPreferences.Editor) {
        editor.putString(LifeOsWidgetBridgeModule.KEY_DISPLAY_STATE, "CLEAR")
        editor.putString(LifeOsWidgetBridgeModule.KEY_VISUAL_INTENT, "CALM")
        editor.putString(LifeOsWidgetBridgeModule.KEY_PRIMARY_TITLE, "You're clear.")
        editor.putString(LifeOsWidgetBridgeModule.KEY_SECONDARY_TEXT, "")
        editor.putString(LifeOsWidgetBridgeModule.KEY_BADGE_TEXT, "CLEAR")
        editor.putBoolean(LifeOsWidgetBridgeModule.KEY_CAN_START, false)
        editor.putBoolean(LifeOsWidgetBridgeModule.KEY_CAN_COMPLETE, false)
        editor.putBoolean(LifeOsWidgetBridgeModule.KEY_CAN_PAUSE, false)
        editor.putBoolean(LifeOsWidgetBridgeModule.KEY_CAN_EXTEND, false)
    }

    @Synchronized
    private fun enqueueOfflineAction(context: Context, idempotencyKey: String, envelope: JSONObject) {
        try {
            val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            val queueRaw = prefs.getString(KEY_CANONICAL_QUEUE, "[]") ?: "[]"
            val queue = JSONArray(queueRaw)

            // Deduplication: Verify action with same idempotencyKey is not already in queue
            for (i in 0 until queue.length()) {
                val item = queue.getJSONObject(i)
                if (item.optString("idempotencyKey") == idempotencyKey) {
                    Log.d(TAG, "Action with idempotencyKey $idempotencyKey already in queue. Skipping duplicate enqueue.")
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

            // Write shadow backup before updating primary queue
            prefs.edit().putString(KEY_CANONICAL_QUEUE_SHADOW, queueRaw).commit()

            queue.put(queueItem)
            prefs.edit().putString(KEY_CANONICAL_QUEUE, queue.toString()).commit()
            Log.i(TAG, "Action successfully enqueued into canonical offline store (count=${queue.length()})")
            LifeOsQueueReplayWorker.scheduleReplay(context)
        } catch (t: Throwable) {
            Log.e(TAG, "Failed to enqueue offline action", t)
        }
    }

    private fun isNetworkAvailable(context: Context): Boolean {
        val cm = context.getSystemService(Context.CONNECTIVITY_SERVICE) as? ConnectivityManager ?: return false
        val network = cm.activeNetwork ?: return false
        val capabilities = cm.getNetworkCapabilities(network) ?: return false
        return capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
    }

    private data class DispatchResult(
        val httpCode: Int,
        val outcome: String,
        val reprojectionJson: String?,
        val errorMessage: String?
    )

    private fun executeDispatch(urlStr: String, token: String, payload: JSONObject): DispatchResult {
        var conn: HttpURLConnection? = null
        try {
            val url = URL(urlStr)
            conn = url.openConnection() as HttpURLConnection
            conn.requestMethod = "POST"
            conn.connectTimeout = 4000
            conn.readTimeout = 4000
            conn.doOutput = true
            conn.doInput = true
            conn.setRequestProperty("Content-Type", "application/json; charset=UTF-8")
            conn.setRequestProperty("Authorization", "Bearer $token")

            val os = OutputStreamWriter(conn.outputStream, StandardCharsets.UTF_8)
            os.write(payload.toString())
            os.flush()
            os.close()

            val httpCode = conn.responseCode
            val isSuccess = httpCode in 200..299
            val stream = if (isSuccess) conn.inputStream else conn.errorStream

            val reader = BufferedReader(InputStreamReader(stream, StandardCharsets.UTF_8))
            val sb = java.lang.StringBuilder()
            var line: String?
            while (reader.readLine().also { line = it } != null) {
                sb.append(line)
            }
            reader.close()

            val responseBody = sb.toString()
            Log.d(TAG, "Dispatch HTTP $httpCode response: $responseBody")

            if (isSuccess && responseBody.isNotEmpty()) {
                val json = JSONObject(responseBody)
                val outcome = json.optString("outcome", "EXECUTE_COMMITTED")
                val reprojection = json.optJSONObject("reprojection")?.toString()
                val errorMsg = json.optString("errorMessage", "")
                return DispatchResult(httpCode, outcome, reprojection, errorMsg)
            }

            return DispatchResult(httpCode, "FAILED", null, "HTTP $httpCode")
        } catch (t: Throwable) {
            Log.e(TAG, "Network call failed during executeDispatch", t)
            return DispatchResult(-1, "NETWORK_ERROR", null, t.localizedMessage)
        } finally {
            conn?.disconnect()
        }
    }
}
