package me.guidetrain.app

import android.webkit.JavascriptInterface
import androidx.core.view.WindowCompat

/**
 * JS-facing bridge (window.AndroidDisplayBridge) that keeps the native
 * status bar's icon color matching GuideTrain's own Light/Dark/Auto theme
 * choice (see apps/web/src/state/useTheme.ts) rather than only the device's
 * system dark/light mode, which could otherwise mismatch what's actually on
 * screen.
 */
class DisplayBridge(private val activity: MainActivity) {
    @JavascriptInterface
    fun setStatusBarAppearance(isLightBackground: Boolean) {
        activity.runOnUiThread {
            WindowCompat.getInsetsController(activity.window, activity.window.decorView)
                .isAppearanceLightStatusBars = isLightBackground
        }
    }
}
