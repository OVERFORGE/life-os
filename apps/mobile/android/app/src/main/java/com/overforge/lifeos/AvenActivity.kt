package com.overforge.lifeos

import android.content.Intent
import android.os.Bundle
import android.util.Log
import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.fabricEnabled
import com.facebook.react.defaults.DefaultReactActivityDelegate

/**
 * AvenActivity
 * 
 * Sovereign Dedicated Android Surface for Aven (Voice & Text modes).
 * Runs in its own separate task (taskAffinity="com.overforge.lifeos.aven").
 * Completely isolated from MainActivity / LifeOS dashboard.
 * Presents a transparent window directly over the user's home screen or current app.
 * Direct DefaultReactActivityDelegate eliminates coroutine lifecycle crashes.
 */
class AvenActivity : ReactActivity() {

    override fun getMainComponentName(): String = "AvenTransient"

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(null)
    }

    override fun createReactActivityDelegate(): ReactActivityDelegate {
        return object : DefaultReactActivityDelegate(
            this,
            mainComponentName,
            fabricEnabled
        ) {
            override fun getLaunchOptions(): Bundle {
                val bundle = Bundle()
                val mode = intent?.getStringExtra("mode") ?: "voice"
                bundle.putString("initialMode", mode)
                return bundle
            }
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
    }

    override fun onPause() {
        try {
            super.onPause()
        } catch (e: Throwable) {
            Log.w("AvenActivity", "Handled lifecycle onPause: ${e.message}")
        }
    }

    override fun onDestroy() {
        try {
            super.onDestroy()
        } catch (e: Throwable) {
            Log.w("AvenActivity", "Handled lifecycle onDestroy: ${e.message}")
        }
    }

    override fun finish() {
        super.finish()
        overridePendingTransition(0, android.R.anim.fade_out)
    }
}
