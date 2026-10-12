package blog.go10.embedbridge

import android.os.SystemClock
import android.view.InputDevice
import android.view.MotionEvent
import android.view.View
import android.view.ViewGroup
import androidx.webkit.WebViewCompat
import androidx.webkit.WebViewFeature
import com.reactnativecommunity.webview.RNCWebView
import com.reactnativecommunity.webview.RNCWebViewWrapper
import expo.modules.kotlin.functions.Queues
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * The player's native helpers (spec: Android TV player controls → 2, 3):
 * run our script inside the embed's cross-origin frames, and tap the WebView
 * where the TV pointer is.
 */
class EmbedBridgeModule : Module() {
  /** The RNCWebView at `viewTag` or anywhere under it (the app passes its container's tag). */
  private fun webView(viewTag: Int): RNCWebView? = appContext.findView<View>(viewTag)?.let(::find)

  private fun find(view: View): RNCWebView? {
    if (view is RNCWebViewWrapper) return view.webView
    if (view is RNCWebView) return view
    val group = view as? ViewGroup ?: return null
    for (i in 0 until group.childCount) find(group.getChildAt(i))?.let { return it }
    return null
  }

  override fun definition() = ModuleDefinition {
    Name("EmbedBridge")

    AsyncFunction("install") { viewTag: Int, script: String, origins: List<String> ->
      val web = webView(viewTag) ?: return@AsyncFunction "noView"
      // RN's focusable={false} only reaches react-native-webview's wrapper: the
      // WebView itself would still take focus (on a touch, or by default) and
      // swallow the remote's keys. The TV player needs every key in RN.
      web.isFocusable = false
      web.isFocusableInTouchMode = false
      web.clearFocus()
      if (!WebViewFeature.isFeatureSupported(WebViewFeature.DOCUMENT_START_SCRIPT)) return@AsyncFunction "unsupported"
      try {
        WebViewCompat.addDocumentStartJavaScript(web, script, origins.toSet())
        "installed"
      } catch (e: Exception) {
        "error"
      }
    }.runOnQueue(Queues.MAIN)

    AsyncFunction("tap") { viewTag: Int, xDp: Double, yDp: Double ->
      val web = webView(viewTag) ?: return@AsyncFunction false
      val density = web.resources.displayMetrics.density
      val x = (xDp * density).toFloat()
      val y = (yDp * density).toFloat()
      val downAt = SystemClock.uptimeMillis()
      fun send(action: Int, at: Long) {
        val event = MotionEvent.obtain(downAt, at, action, x, y, 0)
        event.source = InputDevice.SOURCE_TOUCHSCREEN
        web.dispatchTouchEvent(event)
        event.recycle()
      }
      send(MotionEvent.ACTION_DOWN, downAt)
      web.postDelayed({ send(MotionEvent.ACTION_UP, SystemClock.uptimeMillis()) }, 60)
      true
    }.runOnQueue(Queues.MAIN)

    Function("webViewVersion") {
      val context = appContext.reactContext ?: return@Function "?"
      WebViewCompat.getCurrentWebViewPackage(context)?.versionName ?: "?"
    }
  }
}
