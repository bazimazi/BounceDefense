package com.bazimazi.bouncedefense

import android.os.Bundle
import android.view.View
import androidx.activity.enableEdgeToEdge
import androidx.core.content.ContextCompat
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat

class MainActivity : TauriActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)
    // Match the game's backdrop so cutout padding and startup never flash white.
    window.decorView.setBackgroundColor(ContextCompat.getColor(this, R.color.game_background))
    // The game runs immersive (system bars hidden), so only camera cutouts need insetting.
    ViewCompat.setOnApplyWindowInsetsListener(findViewById<View>(android.R.id.content)) { view, insets ->
      val cutout = insets.getInsets(WindowInsetsCompat.Type.displayCutout())
      view.setPadding(cutout.left, cutout.top, cutout.right, cutout.bottom)
      insets
    }
    hideSystemBars()
  }

  override fun onWindowFocusChanged(hasFocus: Boolean) {
    super.onWindowFocusChanged(hasFocus)
    // Dialogs, the recents screen and transient swipes can restore the bars.
    if (hasFocus) hideSystemBars()
  }

  private fun hideSystemBars() {
    WindowCompat.getInsetsController(window, window.decorView).apply {
      systemBarsBehavior = WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
      hide(WindowInsetsCompat.Type.systemBars())
    }
  }
}
