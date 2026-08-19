package me.guidetrain.app.auth

import android.net.Uri
import android.webkit.JavascriptInterface
import androidx.browser.customtabs.CustomTabsIntent
import me.guidetrain.app.MainActivity

/**
 * JS-facing bridge (window.GuideTrainAuthBridge) that hands Google's OAuth
 * consent screen off to a real browser tab instead of the embedded WebView.
 *
 * Google's own policy rejects an OAuth flow that loads inside an embedded
 * WebView ("disallowed_useragent") — there is no way around this from
 * inside the WebView itself. `apps/web/src/lib/nativeAuthBridge.ts` calls
 * `signInWithOAuth` with `skipBrowserRedirect: true`, gets back the
 * authorize URL Supabase would otherwise have navigated to, and hands it
 * here instead. `androidx.browser.customtabs.CustomTabsIntent` opens it as
 * a first-party Chrome Custom Tab — Google's own documented fix for this —
 * and the provider's redirect (registered as guidetrain://auth-callback,
 * see AndroidManifest.xml) routes back into MainActivity.onNewIntent, which
 * reloads the WebView at the page's own origin with the callback's query
 * string attached.
 */
class AuthBridge(private val activity: MainActivity) {
    @JavascriptInterface
    fun startOAuth(url: String) {
        activity.runOnUiThread {
            CustomTabsIntent.Builder().build().launchUrl(activity, Uri.parse(url))
        }
    }
}
