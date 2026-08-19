import AuthenticationServices
import UIKit
import WebKit

/// Bridges two things the web app's own JS can't do inside an embedded
/// WKWebView (see auth-bridge-shim.js, injected as a WKUserScript, and
/// apps/web/src/lib/nativeAuthBridge.ts on the JS side):
///
/// - **OAuth sign-in.** Google refuses to show its consent screen inside an
///   embedded WebView at all ("disallowed_useragent"). `signInWithOAuth` on
///   the web side calls with `skipBrowserRedirect: true`, gets back the
///   authorize URL Supabase would otherwise have navigated to, and posts it
///   here as a `startOAuth` message. This presents it in a real system
///   browser context via `ASWebAuthenticationSession` — Apple's documented
///   mechanism for exactly this case — with the callback scheme
///   (`guidetrain://auth-callback`) already registered as the OAuth
///   `redirectTo`. Once the session captures that callback, the WKWebView
///   is reloaded at its own origin/path with the callback's query string
///   attached, so Supabase's PKCE `exchangeCodeForSession` (which stores
///   its code verifier in localStorage, keyed by origin) finds it exactly
///   as it would after a real browser redirect — this is fire-and-forget
///   from the JS side; there's no request/response value to hand back.
/// - **Status bar theming.** `setStatusBarAppearance` mirrors the same
///   bridge call Android's DisplayBridge implements, keeping the status
///   bar's icon color matching GuideTrain's own Light/Dark/Auto choice
///   (apps/web/src/state/useTheme.ts) via WebViewController.
final class AuthBridge: NSObject, WKScriptMessageHandler, ASWebAuthenticationPresentationContextProviding {
    static let messageHandlerName = "authBridge"
    static let callbackScheme = "guidetrain"

    private weak var webView: WKWebView?
    private var session: ASWebAuthenticationSession?
    weak var statusBarDelegate: WebViewController?

    func attach(to webView: WKWebView) {
        self.webView = webView
    }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard message.name == Self.messageHandlerName,
              let body = message.body as? [String: Any],
              let method = body["method"] as? String
        else { return }

        switch method {
        case "startOAuth":
            guard let urlString = body["url"] as? String, let url = URL(string: urlString) else { return }
            startOAuth(url: url)
        case "setStatusBarAppearance":
            let isLightBackground = (body["isLightBackground"] as? Bool) ?? true
            DispatchQueue.main.async { self.statusBarDelegate?.setStatusBarAppearance(isLightBackground: isLightBackground) }
        default:
            break
        }
    }

    private func startOAuth(url: URL) {
        let session = ASWebAuthenticationSession(url: url, callbackURLScheme: Self.callbackScheme) { [weak self] callbackURL, error in
            guard let self, let callbackURL, error == nil else { return }
            self.reloadWebView(withCallback: callbackURL)
        }
        session.presentationContextProvider = self
        // Lets an existing Google session in the system browser carry over,
        // rather than forcing a fresh sign-in every time.
        session.prefersEphemeralWebBrowserSession = false
        self.session = session
        DispatchQueue.main.async { session.start() }
    }

    private func reloadWebView(withCallback callbackURL: URL) {
        let query = callbackURL.query.map { "?\($0)" } ?? ""
        let target = URL(string: "\(LocalSchemeHandler.scheme)://\(LocalSchemeHandler.host)/index.html\(query)")!
        DispatchQueue.main.async { self.webView?.load(URLRequest(url: target)) }
    }

    func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
        UIApplication.shared.connectedScenes
            .compactMap { ($0 as? UIWindowScene)?.keyWindow }
            .first ?? ASPresentationAnchor()
    }
}
