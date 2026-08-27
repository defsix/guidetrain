/**
 * The hand-off to the Android shell app's own file-save flow — see
 * android/app/src/main/kotlin/me/guidetrain/app/DownloadBridge.kt.
 *
 * An embedded WebView has no download UI of its own: a Blob URL and a
 * synthetic `<a download>` click work in a real browser tab because the
 * browser itself catches the click and hands it to the OS, but nothing
 * inside a bare WebView does that — the click resolves to nothing and the
 * export silently fails. The native app injects a small bridge object
 * before this page loads; when it's present, `downloadFile` (see
 * `download.ts`) hands the content to native code instead, which opens
 * Android's own document picker so the reader still chooses where the file
 * lands. On the plain website, and on any shell that doesn't inject this,
 * it doesn't exist, and `downloadFile` falls back to the ordinary Blob
 * approach.
 */

declare global {
  interface Window {
    GuideTrainDownloadBridge?: { saveFile(filename: string, mimeType: string, content: string): void };
  }
}

export function isNativeDownloadBridgeAvailable(): boolean {
  return typeof window.GuideTrainDownloadBridge?.saveFile === "function";
}

export function saveFileNatively(filename: string, mimeType: string, content: string): void {
  window.GuideTrainDownloadBridge?.saveFile(filename, mimeType, content);
}
