/**
 * The hand-off to the Android/iOS shell apps' OAuth workaround.
 *
 * Google refuses to show its consent screen inside an embedded WebView
 * ("disallowed_useragent") — that's the whole reason this file exists. The
 * native apps (see android/ and ios/ at the repo root) inject a small bridge
 * object before this page loads; when it's present, sign-in hands the OAuth
 * URL to native code instead of letting Supabase navigate the WebView
 * directly. Android exposes `window.GuideTrainAuthBridge.startOAuth(url)`
 * (a `@JavascriptInterface`); iOS exposes
 * `window.webkit.messageHandlers.authBridge` (a `WKScriptMessageHandler`).
 * On the plain website, neither exists, and `useAuth`'s `signInWithOAuth`
 * falls back to its ordinary same-window redirect.
 */

declare global {
  interface Window {
    GuideTrainAuthBridge?: { startOAuth(url: string): void };
    webkit?: { messageHandlers?: { authBridge?: { postMessage(body: unknown): void } } };
  }
}

/** The custom-scheme redirect the native apps register to catch the OAuth callback. */
export const NATIVE_OAUTH_REDIRECT = "guidetrain://auth-callback";

export function isNativeAuthBridgeAvailable(): boolean {
  return (
    typeof window.GuideTrainAuthBridge?.startOAuth === "function" ||
    Boolean(window.webkit?.messageHandlers?.authBridge)
  );
}

export function startNativeOAuth(url: string): void {
  if (window.GuideTrainAuthBridge) {
    window.GuideTrainAuthBridge.startOAuth(url);
    return;
  }
  window.webkit?.messageHandlers?.authBridge?.postMessage({ method: "startOAuth", url });
}
