package com.overforge.lifeos

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.widget.RemoteViews

/**
 * GlanceWidgetProvider
 * 
 * Android Home Screen Widget (Class A Glance Surface).
 * Strictly read-only projection membrane.
 * Follows Executioners visual language (#161618 dark surface, #E8414A red accents).
 */
class GlanceWidgetProvider : AppWidgetProvider() {

    override fun onUpdate(context: Context, appWidgetManager: AppWidgetManager, appWidgetIds: IntArray) {
        for (appWidgetId in appWidgetIds) {
            updateWidget(context, appWidgetManager, appWidgetId)
        }
    }

    override fun onReceive(context: Context, intent: Intent) {
        super.onReceive(context, intent)
        if (intent.action == ACTION_WIDGET_UPDATE) {
            val appWidgetManager = AppWidgetManager.getInstance(context)
            val thisWidget = ComponentName(context, GlanceWidgetProvider::class.java)
            val allIds = appWidgetManager.getAppWidgetIds(thisWidget)
            for (id in allIds) {
                updateWidget(context, appWidgetManager, id)
            }
        }
    }

    companion object {
        const val ACTION_WIDGET_UPDATE = "com.overforge.lifeos.ACTION_WIDGET_UPDATE"
        const val PREFS_NAME = "lifeos_surface_prefs"

        fun updateWidget(context: Context, appWidgetManager: AppWidgetManager, appWidgetId: Int) {
            val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            val title = prefs.getString("title", "All commitments clear") ?: "All commitments clear"
            val subtitle = prefs.getString("subtitle", "Silence is a successful state") ?: "Silence is a successful state"
            val mode = prefs.getString("mode", "SILENT") ?: "SILENT"

            val views = RemoteViews(context.packageName, R.layout.widget_glance_layout)

            views.setTextViewText(R.id.widget_title, title)
            views.setTextViewText(R.id.widget_subtitle, subtitle)
            views.setTextViewText(R.id.widget_mode_badge, mode)

            // Intent to open Main Application
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

            // Intent to open Aven voice/chat directly
            val avenIntent = Intent(Intent.ACTION_VIEW, Uri.parse("mobile://chat-modal")).apply {
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
        }
    }
}
