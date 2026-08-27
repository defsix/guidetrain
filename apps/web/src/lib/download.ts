import { isNativeDownloadBridgeAvailable, saveFileNatively } from "./nativeDownloadBridge";

/**
 * Hands a text file to the reader — through the Android shell's own save
 * flow where it's available (see `nativeDownloadBridge.ts`), or the
 * ordinary Blob-and-`<a download>` trick everywhere else: the plain
 * website, and any shell (iOS's WKWebView included) that doesn't inject a
 * bridge and so is trusted to handle a page-initiated download itself.
 * Shared by the CSV export (History) and the Markdown export (Progress)
 * rather than each doing this separately, now that there are two of them
 * and the choice between the two delivery paths is identical either way.
 */
export function downloadFile(filename: string, content: string, mime: string): void {
  if (isNativeDownloadBridgeAvailable()) {
    saveFileNatively(filename, mime, content);
    return;
  }
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
