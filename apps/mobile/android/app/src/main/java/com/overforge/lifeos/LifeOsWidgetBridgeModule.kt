package com.overforge.lifeos

import android.content.Context
import android.content.Intent
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

/**
 * LifeOsWidgetBridgeModule
 * 
 * Bridges React Native surface projections directly into Android SharedPreferences
 * and notifies GlanceWidgetProvider to update home-screen widgets immediately.
 */
class LifeOsWidgetBridgeModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String {
        return "LifeOsWidgetBridge"
    }

    @ReactMethod
    fun updateWidgetState(title: String, subtitle: String, mode: String, count: Int, promise: Promise) {
        try {
            val context = reactApplicationContext
            val prefs = context.getSharedPreferences(GlanceWidgetProvider.PREFS_NAME, Context.MODE_PRIVATE)
            
            prefs.edit()
                .putString("title", title)
                .putString("subtitle", subtitle)
                .putString("mode", mode)
                .putInt("count", count)
                .putLong("updated_at", System.currentTimeMillis())
                .apply()

            // Trigger broadcast to refresh all active widget instances
            val updateIntent = Intent(context, GlanceWidgetProvider::class.java).apply {
                action = GlanceWidgetProvider.ACTION_WIDGET_UPDATE
            }
            context.sendBroadcast(updateIntent)

            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("WIDGET_UPDATE_ERROR", e.localizedMessage, e)
        }
    }
}
