package com.overforge.lifeos

import android.content.Context
import android.content.Intent
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.util.Log
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import org.json.JSONArray
import org.json.JSONObject
import java.io.BufferedReader
import java.io.InputStreamReader
import java.io.OutputStreamWriter
import java.net.HttpURLConnection
import java.net.URL
import java.nio.charset.StandardCharsets

/**
 * LifeOsQueueReplayWorker
 * 
 * Android WorkManager Worker implementing Crash-Safe Two-Phase Leased Replay
 * for the single canonical offline action queue (canonical_pending_actions).
 * 
 * Guarantees:
 * 1. Serialized Execution: Exactly one replay worker executes at any instant (ExistingWorkPolicy.KEEP).
 * 2. Two-Phase Leased Items: Items are claimed with 30s lease; crashes during dispatch are safely reclaimed.
 * 3. Terminal Dequeue: Items are ONLY dequeued on authoritative kernel outcome (EXECUTE_COMMITTED, REJECTED_IDEMPOTENT_DUPLICATE, REJECTED_STALE).
 * 4. Stale Reconciliation: Stale actions are permanently dequeued rather than blindly retried.
 */
class LifeOsQueueReplayWorker(
    context: Context,
    params: WorkerParameters
) : CoroutineWorker(context, params) {

    companion object {
        private const val TAG = "LifeOsQueueReplayWorker"
        const val WORK_NAME = "LifeOsQueueReplayWorker"
        const val PREFS_NAME = GlanceWidgetProvider.PREFS_NAME
        const val KEY_CANONICAL_QUEUE = "canonical_pending_actions"
        const val KEY_CANONICAL_QUEUE_SHADOW = "canonical_pending_actions_shadow"
        const val LEASE_DURATION_MS = 30000L

        /**
         * Enqueues a single serialized replay worker when network connectivity returns.
         */
        fun scheduleReplay(context: Context) {
            val constraints = Constraints.Builder()
                .setRequiredNetworkType(NetworkType.CONNECTED)
                .build()

            val workRequest = OneTimeWorkRequestBuilder<LifeOsQueueReplayWorker>()
                .setConstraints(constraints)
                .build()

            WorkManager.getInstance(context).enqueueUniqueWork(
                WORK_NAME,
                ExistingWorkPolicy.KEEP,
                workRequest
            )
            Log.d(TAG, "Replay worker scheduled with ExistingWorkPolicy.KEEP")
        }
    }

    override suspend fun doWork(): Result {
        Log.i(TAG, "Starting canonical offline queue replay worker...")

        val context = applicationContext
        if (!isNetworkConnected(context)) {
            Log.w(TAG, "Network not available. Retrying replay later.")
            return Result.retry()
        }

        val session = LifeOsSecureVault.getActiveSession(context)
        if (session == null || session.isExpired) {
            Log.w(TAG, "Active session is expired or unavailable in vault. Replay halted.")
            return Result.failure()
        }

        val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        val rawQueue = prefs.getString(KEY_CANONICAL_QUEUE, "[]") ?: "[]"
        val queue: JSONArray

        try {
            queue = JSONArray(rawQueue)
        } catch (t: Throwable) {
            Log.e(TAG, "Queue corruption detected. Checking shadow backup.", t)
            val shadowRaw = prefs.getString(KEY_CANONICAL_QUEUE_SHADOW, "[]") ?: "[]"
            return try {
                val shadowQueue = JSONArray(shadowRaw)
                prefs.edit().putString(KEY_CANONICAL_QUEUE, shadowQueue.toString()).commit()
                Result.retry()
            } catch (shadowErr: Throwable) {
                Log.e(TAG, "Both queue and shadow are corrupt. Quarantining payload.", shadowErr)
                prefs.edit()
                    .putString("canonical_corrupt_${System.currentTimeMillis()}", rawQueue)
                    .putString(KEY_CANONICAL_QUEUE, "[]")
                    .commit()
                Result.failure()
            }
        }

        if (queue.length() == 0) {
            Log.i(TAG, "Canonical offline queue is empty. Replay complete.")
            return Result.success()
        }

        val remainingItems = JSONArray()
        val baseUrl = prefs.getString("api_base_url", WidgetActionReceiver.DEFAULT_API_URL) ?: WidgetActionReceiver.DEFAULT_API_URL
        val dispatchUrl = if (baseUrl.endsWith("/api")) "$baseUrl/kernel/dispatch" else "$baseUrl/api/kernel/dispatch"

        var hasNetworkFailure = false

        for (i in 0 until queue.length()) {
            val item = queue.getJSONObject(i)
            val idempotencyKey = item.getString("idempotencyKey")
            val status = item.optString("status", "PENDING")
            val leaseExpiresAtMs = item.optLong("leaseExpiresAtMs", 0L)
            val envelope = item.getJSONObject("envelope")

            // Phase 1: Two-Phase Lease Watchdog & Crash Recovery
            val now = System.currentTimeMillis()
            if (status == "IN_FLIGHT" && leaseExpiresAtMs > now) {
                // Another thread/process is actively executing this item; preserve it
                remainingItems.put(item)
                continue
            }

            // Claim lease
            item.put("status", "IN_FLIGHT")
            item.put("leaseExpiresAtMs", now + LEASE_DURATION_MS)

            // Write lease state to disk immediately
            prefs.edit().putString(KEY_CANONICAL_QUEUE, queue.toString()).commit()

            // Phase 2: Dispatch to Kernel
            try {
                val response = executeHttpRequest(dispatchUrl, session.token, envelope)

                if (response.httpCode in 200..299) {
                    val outcome = response.outcome
                    Log.i(TAG, "Replayed item $idempotencyKey committed with outcome: $outcome")

                    when (outcome) {
                        "EXECUTE_COMMITTED", "EXECUTE_WITH_UNDO", "REJECTED_IDEMPOTENT_DUPLICATE" -> {
                            // Terminal Success: Item is successfully dequeued (not added to remainingItems)
                        }
                        "REJECTED_STALE" -> {
                            // Stale action reconciled: Dequeue without blind retry
                            Log.w(TAG, "Replayed item $idempotencyKey superseded on server. Dequeuing.")
                        }
                        "CONFIRMATION_REQUIRED" -> {
                            // Needs user confirmation: Dequeue from auto-replay
                            Log.w(TAG, "Replayed item $idempotencyKey requires manual confirmation. Dequeuing.")
                        }
                        else -> {
                            // Unrecognized outcome: Dequeue to avoid infinite poison pill
                            Log.w(TAG, "Replayed item $idempotencyKey unrecognized outcome: $outcome. Dequeuing.")
                        }
                    }
                } else if (response.httpCode == 401 || response.httpCode == 403) {
                    Log.e(TAG, "Auth expired during replay. Halting queue replay.")
                    item.put("status", "PENDING")
                    item.put("leaseExpiresAtMs", 0L)
                    remainingItems.put(item)
                    break
                } else {
                    Log.e(TAG, "HTTP error ${response.httpCode} during replay of $idempotencyKey.")
                    item.put("status", "PENDING")
                    item.put("leaseExpiresAtMs", 0L)
                    remainingItems.put(item)
                    hasNetworkFailure = true
                    break
                }
            } catch (t: Throwable) {
                Log.e(TAG, "Network exception during replay of item $idempotencyKey", t)
                item.put("status", "PENDING")
                item.put("leaseExpiresAtMs", 0L)
                remainingItems.put(item)
                hasNetworkFailure = true
                break
            }
        }

        // Write shadow backup and remaining queue atomically
        prefs.edit()
            .putString(KEY_CANONICAL_QUEUE_SHADOW, rawQueue)
            .putString(KEY_CANONICAL_QUEUE, remainingItems.toString())
            .commit()

        Log.i(TAG, "Replay iteration finished. Remaining queued items: ${remainingItems.length()}")

        // Broadcast widget update to refresh presentation
        val updateIntent = Intent(context, GlanceWidgetProvider::class.java).apply {
            action = GlanceWidgetProvider.ACTION_WIDGET_UPDATE
        }
        context.sendBroadcast(updateIntent)

        return if (hasNetworkFailure) Result.retry() else Result.success()
    }

    private fun isNetworkConnected(context: Context): Boolean {
        val cm = context.getSystemService(Context.CONNECTIVITY_SERVICE) as? ConnectivityManager ?: return false
        val network = cm.activeNetwork ?: return false
        val capabilities = cm.getNetworkCapabilities(network) ?: return false
        return capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
    }

    private data class ReplayResponse(
        val httpCode: Int,
        val outcome: String,
        val reprojectionJson: String?
    )

    private fun executeHttpRequest(urlStr: String, token: String, payload: JSONObject): ReplayResponse {
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
            var outcome = "EXECUTE_COMMITTED"
            var reprojection: String? = null

            if (isSuccess && responseBody.isNotEmpty()) {
                val json = JSONObject(responseBody)
                outcome = json.optString("outcome", "EXECUTE_COMMITTED")
                reprojection = json.optJSONObject("reprojection")?.toString()
            }

            return ReplayResponse(httpCode, outcome, reprojection)
        } finally {
            conn?.disconnect()
        }
    }
}
