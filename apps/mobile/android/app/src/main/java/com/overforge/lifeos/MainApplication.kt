package com.overforge.lifeos

import android.app.Application
import android.content.Context
import android.content.Intent
import android.content.res.Configuration
import android.os.Environment
import android.os.Process
import java.io.File
import java.io.PrintWriter
import java.io.StringWriter

import com.facebook.react.PackageList
import com.facebook.react.ReactApplication
import com.facebook.react.ReactNativeApplicationEntryPoint.loadReactNative
import com.facebook.react.ReactPackage
import com.facebook.react.ReactHost
import com.facebook.react.common.ReleaseLevel
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint

import expo.modules.ApplicationLifecycleDispatcher
import expo.modules.ExpoReactHostFactory

class MainApplication : Application(), ReactApplication {

  init {
    val defaultHandler = Thread.getDefaultUncaughtExceptionHandler()
    Thread.setDefaultUncaughtExceptionHandler { thread, throwable ->
      try {
        val sw = StringWriter()
        throwable.printStackTrace(PrintWriter(sw))
        val stackTrace = sw.toString()

        // 1. Try to write to Downloads folder
        try {
          val downloads = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS)
          File(downloads, "lifeos_crash.txt").writeText("Thread [${thread.name}] CRASH:\n\n$stackTrace")
        } catch (_: Exception) {}

        // 2. Launch CrashReportActivity in separate process
        try {
          val intent = Intent().apply {
            setClassName("com.overforge.lifeos", "com.overforge.lifeos.CrashReportActivity")
            putExtra("error", stackTrace)
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK)
          }
          startActivity(intent)
        } catch (_: Exception) {}
      } catch (_: Exception) {}

      defaultHandler?.uncaughtException(thread, throwable) ?: run {
        Process.killProcess(Process.myPid())
        System.exit(10)
      }
    }
  }

  override val reactHost: ReactHost by lazy {
    ExpoReactHostFactory.getDefaultReactHost(
      context = applicationContext,
      packageList =
        PackageList(this).packages.apply {
          // Custom native modules
          add(LifeOsNativePackage())
        }
    )
  }

  override fun onCreate() {
    super.onCreate()
    DefaultNewArchitectureEntryPoint.releaseLevel = try {
      ReleaseLevel.valueOf(BuildConfig.REACT_NATIVE_RELEASE_LEVEL.uppercase())
    } catch (e: IllegalArgumentException) {
      ReleaseLevel.STABLE
    }
    loadReactNative(this)
    ApplicationLifecycleDispatcher.onApplicationCreate(this)
  }

  override fun onConfigurationChanged(newConfig: Configuration) {
    super.onConfigurationChanged(newConfig)
    ApplicationLifecycleDispatcher.onConfigurationChanged(this, newConfig)
  }
}
