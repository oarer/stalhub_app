package dev.stalhub.app

import android.os.Bundle
import android.view.View
import android.view.ViewGroup
import android.webkit.WebView
import androidx.activity.enableEdgeToEdge

class MainActivity : TauriActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)
    // Гасим stretch/glow overscroll-эффект: этот WebView игнорирует
    // CSS overscroll-behavior, поэтому OVER_SCROLL_NEVER нативно.
    disableOverscroll(window.decorView)
    window.decorView.post { disableOverscroll(window.decorView) }
  }

  private fun disableOverscroll(view: View) {
    if (view is WebView) {
      view.overScrollMode = View.OVER_SCROLL_NEVER
    }
    if (view is ViewGroup) {
      for (i in 0 until view.childCount) {
        disableOverscroll(view.getChildAt(i))
      }
    }
  }
}
