package me.guidetrain.app

import android.content.Intent
import android.graphics.Rect
import android.net.Uri
import android.os.Bundle
import android.util.Log
import android.view.KeyEvent
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Toast
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
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
    private var safeAreaTopPx = 0
    private var safeAreaBottomPx = 0
    private var keyboardHeightPx = 0
    // Diagnostic-only — see KeyboardDebugBadge.tsx. The confirmed on-device
    // report (v1.24) was --keyboard-height stuck at 0 with the keyboard
    // visibly open; these are the raw inputs to that calculation, so the
    // badge can show whether the global layout listener is firing at all,
    // and with what numbers, rather than just the one value it produces.
    private var debugLayoutPassCount = 0
    private var debugRootHeightPx = 0
    private var debugFrameBottomPx = 0

    // The file content waiting on the reader to pick a save location in the
    // document-picker launched below — there is only ever one export in
    // flight at a time (the button that starts one is inside a panel the
    // picker's own full-screen UI covers), so a single field is enough.
    // Must be registered unconditionally before onCreate, which is why this
    // is a field initializer rather than something set up inside it.
    private var pendingDownloadContent: String? = null
    private val createDocumentLauncher =
        registerForActivityResult(ActivityResultContracts.CreateDocument("*/*")) { uri ->
            val content = pendingDownloadContent
            pendingDownloadContent = null
            if (uri == null || content == null) return@registerForActivityResult
            try {
                contentResolver.openOutputStream(uri)?.use { it.write(content.toByteArray(Charsets.UTF_8)) }
            } catch (e: Exception) {
                Log.e("GuideTrainDownload", "Failed to write exported file", e)
                Toast.makeText(this, R.string.download_failed, Toast.LENGTH_LONG).show()
            }
        }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        // Draws the WebView edge-to-edge (under the status/nav bars) so the
        // page's own background reaches the physical screen edges — left
        // alone, Android reserves a solid system-drawn strip above the
        // WebView for the status bar, in whatever plain color the theme
        // happens to use there, which reads as the app not actually filling
        // the screen. The header's real padding to clear that area comes
        // from injectSafeAreaInsets below, not from a native inset the
        // WebView never sees.
        enableEdgeToEdge()
        setContentView(R.layout.activity_main)

        assetLoader = WebViewAssetLoader.Builder()
            .addPathHandler("/assets/", AssetsPathHandler(this))
            .build()

        webView = findViewById(R.id.webView)
        configureWebView(webView)

        ViewCompat.setOnApplyWindowInsetsListener(webView) { _, windowInsets ->
            val insets = windowInsets.getInsets(WindowInsetsCompat.Type.systemBars())
            safeAreaTopPx = insets.top
            safeAreaBottomPx = insets.bottom
            injectSafeAreaInsets(webView)
            windowInsets
        }
        setupKeyboardHeightListener()

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

            override fun onPageFinished(view: WebView, url: String?) {
                super.onPageFinished(view, url)
                // Re-apply on every (re)load, since a fresh document has none
                // of the custom properties the insets listener may have
                // already set earlier against the previous document.
                injectSafeAreaInsets(view)
            }
        }

        webView.addJavascriptInterface(AuthBridge(this), "GuideTrainAuthBridge")
        webView.addJavascriptInterface(DisplayBridge(this), "AndroidDisplayBridge")
        webView.addJavascriptInterface(DownloadBridge(this), "GuideTrainDownloadBridge")

        webView.webChromeClient = object : WebChromeClient() {
            override fun onConsoleMessage(message: android.webkit.ConsoleMessage): Boolean {
                Log.d("GuideTrainWebView", "${message.message()} (${message.sourceId()}:${message.lineNumber()})")
                return true
            }
        }
    }

    private fun indexUrl(): String = "https://${WebViewAssetLoader.DEFAULT_DOMAIN}/assets/www/index.html"

    /**
     * Called from DownloadBridge.saveFile, already on the UI thread. Opens
     * Android's document picker rather than writing straight into the
     * public Downloads folder — that would need WRITE_EXTERNAL_STORAGE on
     * the older API levels this app still supports (minSdk 26; scoped
     * storage's MediaStore.Downloads only exists from API 29), and the
     * picker needs no permission at all on any of them. The content sits in
     * pendingDownloadContent until createDocumentLauncher's callback fires
     * with the Uri the reader chose.
     *
     * mimeType is accepted for parity with the JS side's downloadFile(),
     * which always has one — but unused here: the launcher is registered
     * once with a generic wildcard MIME contract, since AndroidX's
     * CreateDocument fixes its MIME type at registration rather than per
     * call, and the two real callers (CSV, Markdown) don't need the system
     * picker to filter or icon differently to be usable.
     */
    fun saveFile(filename: String, @Suppress("UNUSED_PARAMETER") mimeType: String, content: String) {
        pendingDownloadContent = content
        createDocumentLauncher.launch(filename)
    }

    /**
     * WebView doesn't support CSS env(safe-area-inset-*) the way WKWebView on
     * iOS does, so the actual measured system bar insets (converted from raw
     * pixels to CSS px, i.e. dp) are forwarded as the same --safe-area-top /
     * --safe-area-bottom custom properties apps/web/src/index.css already
     * falls back to using env() for on other platforms.
     */
    /**
     * `WindowInsetsCompat.Type.ime()`, read inside `setOnApplyWindowInsetsListener`
     * above, was the modern, "correct" way to get the keyboard's height — and
     * on a real device it never worked: confirmed (v1.19, v1.20) that
     * whatever the listener saw for the IME inset stayed 0 the whole time,
     * keyboard open or closed, so nothing built on top of it — WebView
     * padding, then this same --keyboard-height property — ever carried a
     * real number. Insets only reliably re-dispatch to a listener like that
     * on newer Android versions; nothing here guarantees this device (or
     * WebView's own inset plumbing) actually does.
     *
     * `getWindowVisibleDisplayFrame` predates all of that — it's the
     * technique every "detect the keyboard" library used before
     * WindowInsets existed, and it works by asking the window manager
     * directly for the currently visible frame rather than waiting on any
     * dispatch that might not come. The gap between the root view's full
     * height and how much of it is actually visible *is* the keyboard,
     * whether or not anything above ever told this code so. A global
     * layout listener re-checks that gap on every layout pass, which
     * reliably includes the keyboard opening and closing.
     */
    private fun setupKeyboardHeightListener() {
        val rootView = webView.rootView
        rootView.viewTreeObserver.addOnGlobalLayoutListener {
            val visibleFrame = Rect()
            rootView.getWindowVisibleDisplayFrame(visibleFrame)
            val gap = rootView.height - visibleFrame.bottom
            debugLayoutPassCount++
            debugRootHeightPx = rootView.height
            debugFrameBottomPx = visibleFrame.bottom
            Log.d(
                "GuideTrainKeyboard",
                "pass=$debugLayoutPassCount rootView.height=${rootView.height} " +
                    "visibleFrame.bottom=${visibleFrame.bottom} gap=$gap",
            )
            // A small gap is just the nav bar or a rounding wobble, not the
            // keyboard — a real on-screen keyboard is never under ~15% of
            // the screen.
            keyboardHeightPx = if (gap > rootView.height * 0.15) gap else 0
            // Unconditional now, not just on change — v1.24 confirmed
            // --keyboard-height stuck at 0 with the keyboard visibly open,
            // so the badge needs to show the raw numbers live on every
            // pass to tell whether this listener is firing at all with the
            // keyboard open, not just the one value it lands on.
            injectSafeAreaInsets(webView)
        }
    }

    private fun injectSafeAreaInsets(webView: WebView) {
        val density = resources.displayMetrics.density
        val topDp = (safeAreaTopPx / density).toInt()
        val bottomDp = (safeAreaBottomPx / density).toInt()
        val keyboardDp = (keyboardHeightPx / density).toInt()
        val debugRootHDp = (debugRootHeightPx / density).toInt()
        val debugFrameBottomDp = (debugFrameBottomPx / density).toInt()
        webView.evaluateJavascript(
            "document.documentElement.style.setProperty('--safe-area-top', '${topDp}px');" +
                "document.documentElement.style.setProperty('--safe-area-bottom', '${bottomDp}px');" +
                "document.documentElement.style.setProperty('--keyboard-height', '${keyboardDp}px');" +
                "document.documentElement.style.setProperty('--debug-layout-passes', '$debugLayoutPassCount');" +
                "document.documentElement.style.setProperty('--debug-root-h', '${debugRootHDp}px');" +
                "document.documentElement.style.setProperty('--debug-frame-bottom', '${debugFrameBottomDp}px');",
            null,
        )
    }

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
