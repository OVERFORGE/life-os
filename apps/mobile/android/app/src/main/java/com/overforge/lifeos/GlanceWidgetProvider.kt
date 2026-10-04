package com.overforge.lifeos

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.net.Uri
import android.os.SystemClock
import android.text.format.DateFormat
import android.util.Log
import android.view.View
import android.widget.RemoteViews
import java.util.Date

/**
 * GlanceWidgetProvider
 * 
 * Android Home Screen Widget (Class A Glance Surface).
 * Multi-state presentation membrane supporting CLEAR, UPCOMING, ACTIVE, and PROPOSAL states.
 * Follows the Executioners design palette:
 * - Neutral Obsidian #161618 surface
 * - Muted Neutral dot #88888E for CLEAR
 * - Amber dot #F59E0B for UPCOMING & PROPOSAL
 * - Crimson red #E8414A strictly for ACTIVE execution chronometer and affirm buttons.
 */
class GlanceWidgetProvider : AppWidgetProvider() {

    override fun onUpdate(context: Context, appWidgetManager: AppWidgetManager, appWidgetIds: IntArray) {
        for (appWidgetId in appWidgetIds) {
            updateWidget(context, appWidgetManager, appWidgetId)
        }
    }

    override fun onReceive(context: Context, intent: Intent) {
        super.onReceive(context, intent)
        if (intent.action == ACTION_WIDGET_UPDATE || intent.action == AppWidgetManager.ACTION_APPWIDGET_UPDATE) {
            val appWidgetManager = AppWidgetManager.getInstance(context)
            val thisWidget = ComponentName(context, GlanceWidgetProvider::class.java)
            val allIds = appWidgetManager.getAppWidgetIds(thisWidget)
            for (id in allIds) {
                updateWidget(context, appWidgetManager, id)
            }
        }
    }

    companion object {
        private const val TAG = "GlanceWidgetProvider"
        const val ACTION_WIDGET_UPDATE = "com.overforge.lifeos.ACTION_WIDGET_UPDATE"
        const val PREFS_NAME = "lifeos_surface_prefs"

        fun updateWidget(context: Context, appWidgetManager: AppWidgetManager, appWidgetId: Int) {
            try {
                val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
                
                val displayState = prefs.getString(LifeOsWidgetBridgeModule.KEY_DISPLAY_STATE, "CLEAR") ?: "CLEAR"
                val visualIntent = prefs.getString(LifeOsWidgetBridgeModule.KEY_VISUAL_INTENT, "CALM") ?: "CALM"
                val primaryTitle = prefs.getString(LifeOsWidgetBridgeModule.KEY_PRIMARY_TITLE, "You're clear.") ?: "You're clear."
                val secondaryText = prefs.getString(LifeOsWidgetBridgeModule.KEY_SECONDARY_TEXT, "") ?: ""
                val badgeText = prefs.getString(LifeOsWidgetBridgeModule.KEY_BADGE_TEXT, "CLEAR") ?: "CLEAR"

                val nextStartMs = prefs.getLong(LifeOsWidgetBridgeModule.KEY_NEXT_START_MS, 0L)
                val nextTitle = prefs.getString(LifeOsWidgetBridgeModule.KEY_NEXT_TITLE, "") ?: ""

                val activeEntityId = prefs.getString(LifeOsWidgetBridgeModule.KEY_ACTIVE_ENTITY_ID, "") ?: ""
                val activeStartedAtMs = prefs.getLong(LifeOsWidgetBridgeModule.KEY_ACTIVE_STARTED_AT_MS, 0L)
                val activePlannedMins = prefs.getInt(LifeOsWidgetBridgeModule.KEY_ACTIVE_PLANNED_MINS, 30)
                val activeSeed = prefs.getString(LifeOsWidgetBridgeModule.KEY_ACTIVE_IDEMPOTENCY_SEED, "") ?: ""

                val upcomingEntityId = prefs.getString(LifeOsWidgetBridgeModule.KEY_UPCOMING_ENTITY_ID, "") ?: ""
                val upcomingSeed = prefs.getString(LifeOsWidgetBridgeModule.KEY_UPCOMING_IDEMPOTENCY_SEED, "") ?: ""

                val canStart = prefs.getBoolean(LifeOsWidgetBridgeModule.KEY_CAN_START, false)
                val canComplete = prefs.getBoolean(LifeOsWidgetBridgeModule.KEY_CAN_COMPLETE, false)
                val canPause = prefs.getBoolean(LifeOsWidgetBridgeModule.KEY_CAN_PAUSE, false)
                val canExtend = prefs.getBoolean(LifeOsWidgetBridgeModule.KEY_CAN_EXTEND, false)

                val views = RemoteViews(context.packageName, R.layout.widget_glance_layout)

                // 1. Header Styling & Status Dot
                applyHeaderAndPalette(views, visualIntent, displayState, badgeText)

                // 2. Mutually Exclusive Content State Containers
                views.setViewVisibility(R.id.container_state_clear, if (displayState == "CLEAR") View.VISIBLE else View.GONE)
                views.setViewVisibility(R.id.container_state_upcoming, if (displayState == "UPCOMING") View.VISIBLE else View.GONE)
                views.setViewVisibility(R.id.container_state_active, if (displayState == "ACTIVE") View.VISIBLE else View.GONE)
                views.setViewVisibility(R.id.container_state_proposal, if (displayState == "PROPOSAL") View.VISIBLE else View.GONE)

                when (displayState) {
                    "ACTIVE" -> {
                        views.setTextViewText(R.id.widget_active_title, primaryTitle)
                        views.setTextViewText(R.id.widget_active_subtitle, "Target: ${activePlannedMins}m")
                        
                        // Native Chronometer: calculate elapsed base time
                        if (activeStartedAtMs > 0) {
                            val elapsedSinceStart = System.currentTimeMillis() - activeStartedAtMs
                            val baseTime = SystemClock.elapsedRealtime() - elapsedSinceStart
                            views.setChronometer(R.id.widget_chronometer, baseTime, "%s", true)
                        } else {
                            views.setChronometer(R.id.widget_chronometer, SystemClock.elapsedRealtime(), "%s", true)
                        }
                    }
                    "UPCOMING" -> {
                        views.setTextViewText(R.id.widget_upcoming_title, primaryTitle)
                        views.setTextViewText(R.id.widget_upcoming_subtitle, secondaryText)
                    }
                    "PROPOSAL" -> {
                        views.setTextViewText(R.id.widget_proposal_title, primaryTitle)
                        views.setTextViewText(R.id.widget_proposal_subtitle, if (secondaryText.isNotEmpty()) secondaryText else "Ready to start?")
                    }
                    else -> { // CLEAR
                        views.setTextViewText(R.id.widget_clear_title, primaryTitle)
                        if (nextStartMs > 0 && nextTitle.isNotEmpty()) {
                            val timeStr = DateFormat.getTimeFormat(context).format(Date(nextStartMs))
                            views.setTextViewText(R.id.widget_clear_next, "Next: $nextTitle · $timeStr")
                            views.setViewVisibility(R.id.widget_clear_next, View.VISIBLE)
                        } else {
                            views.setTextViewText(R.id.widget_clear_next, "")
                            views.setViewVisibility(R.id.widget_clear_next, View.GONE)
                        }
                    }
                }

                // 3. Action Controls Row
                val hasAnyAction = canStart || canComplete || canPause || canExtend
                views.setViewVisibility(R.id.container_action_controls, if (hasAnyAction) View.VISIBLE else View.GONE)

                // [▶ Start] Button (Amber-accented Obsidian for Upcoming/Proposal, NEVER CRIMSON)
                views.setViewVisibility(R.id.btn_action_start, if (canStart) View.VISIBLE else View.GONE)
                if (canStart) {
                    val startEntity = if (upcomingEntityId.isNotEmpty()) upcomingEntityId else activeEntityId
                    val startSeed = if (upcomingSeed.isNotEmpty()) upcomingSeed else activeSeed
                    bindActionBroadcast(context, views, R.id.btn_action_start, "start_execution", startEntity, startSeed)
                }

                // [✓ Done] Button (Crimson affirm for Active execution)
                views.setViewVisibility(R.id.btn_action_done, if (canComplete) View.VISIBLE else View.GONE)
                if (canComplete) {
                    bindActionBroadcast(context, views, R.id.btn_action_done, "complete_task", activeEntityId, activeSeed)
                }

                // [⏸] Pause Button (Neutral)
                views.setViewVisibility(R.id.btn_action_pause, if (canPause) View.VISIBLE else View.GONE)
                if (canPause) {
                    bindActionBroadcast(context, views, R.id.btn_action_pause, "pause_execution", activeEntityId, activeSeed)
                }

                // [+15m] Extend Button (Neutral)
                views.setViewVisibility(R.id.btn_action_extend, if (canExtend) View.VISIBLE else View.GONE)
                if (canExtend) {
                    bindActionBroadcast(context, views, R.id.btn_action_extend, "defer_execution", activeEntityId, activeSeed)
                }

                // 4. Root Card Tap Intent (Opens MainActivity)
                val launchIntent = Intent(context, MainActivity::class.java).apply {
                    flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
                }
                val pendingLaunch = PendingIntent.getActivity(
                    context,
                    0,
                    launchIntent,
                    PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
                )
                views.setOnClickPendingIntent(R.id.widget_root, pendingLaunch)

                // 5. Aven Summon Intent (Opens aven-transient with mode=voice)
                val avenIntent = Intent(Intent.ACTION_VIEW, Uri.parse("mobile://aven-transient?mode=voice")).apply {
                    flags = Intent.FLAG_ACTIVITY_NEW_TASK
                }
                val pendingAven = PendingIntent.getActivity(
                    context,
                    1,
                    avenIntent,
                    PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
                )
                views.setOnClickPendingIntent(R.id.widget_aven_button, pendingAven)

                appWidgetManager.updateAppWidget(appWidgetId, views)
            } catch (t: Throwable) {
                Log.e(TAG, "Error updating app widget $appWidgetId", t)
            }
        }

        private fun applyHeaderAndPalette(
            views: RemoteViews,
            intent: String,
            displayState: String,
            badgeText: String
        ) {
            when (intent) {
                "ACTIVE" -> {
                    views.setImageViewResource(R.id.widget_status_dot, R.drawable.widget_dot_crimson)
                    // In active mode, Chronometer inside card handles time, badge is hidden or shows ACTIVE
                    views.setViewVisibility(R.id.widget_mode_badge, View.GONE)
                }
                "UPCOMING", "PROPOSAL" -> {
                    views.setImageViewResource(R.id.widget_status_dot, R.drawable.widget_dot_amber)
                    views.setTextColor(R.id.widget_mode_badge, Color.parseColor("#F59E0B"))
                    views.setInt(R.id.widget_mode_badge, "setBackgroundResource", R.drawable.widget_badge_bg_muted)
                    views.setTextViewText(R.id.widget_mode_badge, badgeText)
                    views.setViewVisibility(R.id.widget_mode_badge, View.VISIBLE)
                }
                else -> { // CALM / CLEAR
                    views.setImageViewResource(R.id.widget_status_dot, R.drawable.widget_dot_gray)
                    views.setTextColor(R.id.widget_mode_badge, Color.parseColor("#88888E"))
                    views.setInt(R.id.widget_mode_badge, "setBackgroundResource", R.drawable.widget_badge_bg_muted)
                    views.setTextViewText(R.id.widget_mode_badge, badgeText)
                    views.setViewVisibility(R.id.widget_mode_badge, View.VISIBLE)
                }
            }
        }

        private fun bindActionBroadcast(
            context: Context,
            views: RemoteViews,
            viewId: Int,
            actionType: String,
            entityId: String,
            seed: String
        ) {
            val intent = Intent(context, WidgetActionReceiver::class.java).apply {
                action = "com.overforge.lifeos.ACTION_HEADLESS_DISPATCH"
                putExtra("action_type", actionType)
                putExtra("entity_id", entityId)
                putExtra("idempotency_seed", seed)
            }
            val requestCode = viewId xor actionType.hashCode()
            val pendingIntent = PendingIntent.getBroadcast(
                context,
                requestCode,
                intent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )
            views.setOnClickPendingIntent(viewId, pendingIntent)
        }
    }
}
