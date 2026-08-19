package me.guidetrain.app

import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.util.Log
import android.view.KeyEvent
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.appcompat.app.AppCompatActivity
import androidx.webkit.WebViewAssetLoader
import androidx.webkit.WebViewAssetLoader.AssetsPathHandler
import me.guidetrain.app.auth.AuthBridge

/**
 * Hosts the existing GuideTrain web app (3D anatomy viewer, workout/progress
 * panels, everything) in a WebView. All product logic lives in the web app
 * under src/main/assets/www (synced from apps/web's dist-android build);
 * this activity is just the native shell: serving the bundled assets over
 * WebViewAssetLoader.DEFAULT_DOMAIN (appassets.androidplatform.net) so
 * fetch() calls to Supabase behave the same as they do on the deployed
 * site, and handing the Google OAuth consent screen off to a Custom Tab
 * (see auth/AuthBridge.kt) since Google refuses to show it inside an
 * embedded WebView.
 */
class MainActivity : AppCompatActivity() {

    private lateinit var webView: WebView
    private lateinit var assetLoader: WebViewAssetLoader

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        assetLoader = WebViewAssetLoader.Builder()
            .addPathHandler("/assets/", AssetsPathHandler(this))
            .build()

        webView = findViewById(R.id.webView)
        configureWebView(webView)

        if (savedInstanceState != null) {
            webView.restoreState(savedInstanceState)
        } else {
            webView.loadUrl(indexUrl())
            handleAuthCallback(intent)
        }
    }

    private fun configureWebView(webView: WebView) {
        val settings = webView.settings
        settings.javaScriptEnabled = true
        settings.domStorageEnabled = true
        settings.databaseEnabled = true
        settings.mediaPlaybackRequiresUserGesture = false
        // These assets are served from AssetsPathHandler (i.e. straight out of
        // the APK, not a real network fetch), so there's no latency cost to
        // skipping the HTTP cache — and every build gives its JS/CSS new
        // content-hashed filenames, so caching the *page* across an in-place
        // app update (`adb install -r`) risks serving a stale cached
        // index.html that references JS files the new APK no longer ships,
        // which loads nothing and leaves a blank white WebView.
        settings.cacheMode = android.webkit.WebSettings.LOAD_NO_CACHE

        webView.webViewClient = object : WebViewClient() {
            override fun shouldInterceptRequest(
                view: WebView,
                request: WebResourceRequest
            ): WebResourceResponse? = assetLoader.shouldInterceptRequest(request.url)
        }

        webView.addJavascriptInterface(AuthBridge(this), "GuideTrainAuthBridge")
        webView.addJavascriptInterface(DisplayBridge(this), "AndroidDisplayBridge")

        webView.webChromeClient = object : WebChromeClient() {
            override fun onConsoleMessage(message: android.webkit.ConsoleMessage): Boolean {
                Log.d("GuideTrainWebView", "${message.message()} (${message.sourceId()}:${message.lineNumber()})")
                return true
            }
        }
    }

    private fun indexUrl(): String = "https://${WebViewAssetLoader.DEFAULT_DOMAIN}/assets/www/index.html"

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        handleAuthCallback(intent)
    }

    /**
     * Reloads the WebView at the page's own origin/path with the OAuth
     * callback's query string appended, rather than navigating to the
     * literal guidetrain://auth-callback URL. Supabase's PKCE flow stores
     * its code verifier in localStorage keyed by origin — reloading the
     * *same* https://appassets.androidplatform.net/assets/www/index.html
     * document with `?code=...&...` attached is what lets
     * detectSessionInUrl/exchangeCodeForSession find that verifier and
     * complete sign-in exactly as it would after a real browser redirect.
     */
    private fun handleAuthCallback(intent: Intent) {
        val data: Uri = intent.data ?: return
        if (data.scheme != "guidetrain" || data.host != "auth-callback") return
        val query = data.encodedQuery
        val target = indexUrl() + (query?.let { "?$it" } ?: "")
        webView.loadUrl(target)
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        webView.saveState(outState)
    }

    override fun onKeyDown(keyCode: Int, event: KeyEvent): Boolean {
        if (keyCode == KeyEvent.KEYCODE_BACK && webView.canGoBack()) {
            webView.goBack()
            return true
        }
        return super.onKeyDown(keyCode, event)
    }

    override fun onDestroy() {
        webView.destroy()
        super.onDestroy()
    }
}
