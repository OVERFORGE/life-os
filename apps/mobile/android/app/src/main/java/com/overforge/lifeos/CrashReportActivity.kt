package com.overforge.lifeos

import android.app.Activity
import android.graphics.Color
import android.os.Bundle
import android.widget.ScrollView
import android.widget.TextView

class CrashReportActivity : Activity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    val error = intent.getStringExtra("error") ?: "No error details available"

    val scrollView = ScrollView(this).apply {
      setBackgroundColor(Color.parseColor("#121214"))
      setPadding(40, 80, 40, 40)
    }

    val textView = TextView(this).apply {
      text = "⚠️ LIFE OS CRASH REPORT\n\n$error\n\n(You can copy this text or take a screenshot)"
      setTextColor(Color.parseColor("#ff5555"))
      textSize = 13f
      setTextIsSelectable(true)
      setLineSpacing(4f, 1.2f)
    }

    scrollView.addView(textView)
    setContentView(scrollView)
  }
}
