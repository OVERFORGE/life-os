package com.overforge.lifeos

import android.os.Bundle
import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.fabricEnabled
import com.facebook.react.defaults.DefaultReactActivityDelegate
import expo.modules.ReactActivityDelegateWrapper

/**
 * AvenActivity
 * 
 * Sovereign Dedicated Android Surface for Aven.
 * Runs in its own separate task (taskAffinity="com.overforge.lifeos.aven").
 * Completely isolated from MainActivity / LifeOS dashboard.
 * Presents a transparent window directly over the user's home screen or current app.
 */
class AvenActivity : ReactActivity() {

    override fun getMainComponentName(): String = "AvenTransient"

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(null)
    }

    override fun createReactActivityDelegate(): ReactActivityDelegate {
        return ReactActivityDelegateWrapper(
            this,
            BuildConfig.IS_NEW_ARCHITECTURE_ENABLED,
            object : DefaultReactActivityDelegate(
                this,
                mainComponentName,
                fabricEnabled
            ){}
        )
    }

    override fun finish() {
        super.finish()
        overridePendingTransition(0, android.R.anim.fade_out)
    }
}
