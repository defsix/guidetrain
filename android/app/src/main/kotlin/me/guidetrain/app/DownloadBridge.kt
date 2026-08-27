package me.guidetrain.app

import android.webkit.JavascriptInterface

/**
 * JS-facing bridge (window.GuideTrainDownloadBridge) for the CSV and
 * Markdown exports on History and Progress — see
 * apps/web/src/lib/download.ts.
 *
 * The web app's own download mechanism (a Blob URL and a synthetic
 * `<a download>` click) has nothing to catch it inside an embedded WebView:
 * there is no download UI here the way there is in a real browser tab, so
 * the click resolves to nothing and the export silently fails. This hands
 * the file to MainActivity.saveFile instead, which opens Android's own
 * document picker (Storage Access Framework) so the reader chooses where it
 * lands — Downloads by default — the same as picking a save location
 * anywhere else on the device.
 */
class DownloadBridge(private val activity: MainActivity) {
    @JavascriptInterface
    fun saveFile(filename: String, mimeType: String, content: String) {
        activity.runOnUiThread {
            activity.saveFile(filename, mimeType, content)
        }
    }
}
