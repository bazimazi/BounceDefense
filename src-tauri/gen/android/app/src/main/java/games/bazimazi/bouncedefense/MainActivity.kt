package games.bazimazi.bouncedefense

import android.os.Bundle
import android.view.View
import android.webkit.WebView
import androidx.activity.OnBackPressedCallback
import androidx.activity.enableEdgeToEdge
import androidx.core.content.ContextCompat
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat

class MainActivity : TauriActivity() {
  private var webView: WebView? = null

  /**
   * System Back (button or gesture) goes to the game, which owns its own history: it pauses a
   * run, closes a sheet or leaves a page. The WebView's own goBack() is a browser-initiated
   * traversal that Chromium lets skip history entries, which could leave the game mid-run.
   * The game cancels the `backbutton` event when it handled Back; at Home it does not, and
   * Back falls through to the default (Tauri's handler, then the system), which leaves the app.
   */
  private val backToGame = object : OnBackPressedCallback(true) {
    override fun handleOnBackPressed() {
      val view = webView ?: return fallThrough()
      view.evaluateJavascript(
        "!document.dispatchEvent(new Event('backbutton',{cancelable:true}))"
      ) { handled -> if (handled != "true") fallThrough() }
    }
  }

  private fun fallThrough() {
    backToGame.isEnabled = false
    onBackPressedDispatcher.onBackPressed()
    backToGame.isEnabled = true
  }

  /** The newest callback runs first; Tauri adds its own once the WebView exists, so go on top. */
  private fun claimBack() {
    backToGame.remove()
    onBackPressedDispatcher.addCallback(this, backToGame)
  }

  override fun onWebViewCreate(webView: WebView) {
    super.onWebViewCreate(webView)
    this.webView = webView
    claimBack()
    // Tauri's plugins load after this callback; claim Back again once they have.
    webView.post { claimBack() }
  }

  override fun onResume() {
    super.onResume()
    if (webView != null) claimBack()
  }

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
      // DEFAULT, not SHOW_TRANSIENT_BARS_BY_SWIPE: with the transient behavior the first edge
      // swipe only reveals the hidden bars, so the Back gesture took two swipes. A stray Back
      // during a run only pauses it.
      systemBarsBehavior = WindowInsetsControllerCompat.BEHAVIOR_DEFAULT
      hide(WindowInsetsCompat.Type.systemBars())
    }
  }
}
