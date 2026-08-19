/**
 * Status-bar theming for the native Android/iOS shells.
 *
 * A WebView's own chrome has no idea GuideTrain has a Light/Dark/Auto choice
 * of its own — left alone, the status bar only ever reflects the *device's*
 * system appearance, which can mismatch what's actually on screen (e.g. the
 * app forced to Dark while the phone itself is in light mode). Android
 * exposes `window.AndroidDisplayBridge.setStatusBarAppearance(bool)`; iOS
 * exposes it through the same `authBridge` message handler used for OAuth
 * (see nativeAuthBridge.ts), since both are the app's one WKScriptMessageHandler.
 * Absent on the plain website, where the browser's own chrome already does
 * the right thing.
 */

declare global {
  interface Window {
    AndroidDisplayBridge?: { setStatusBarAppearance(isLightBackground: boolean): void };
  }
}

export function setNativeStatusBarAppearance(isLightBackground: boolean): void {
  if (window.AndroidDisplayBridge) {
    window.AndroidDisplayBridge.setStatusBarAppearance(isLightBackground);
    return;
  }
  window.webkit?.messageHandlers?.authBridge?.postMessage({
    method: "setStatusBarAppearance",
    isLightBackground,
  });
}
