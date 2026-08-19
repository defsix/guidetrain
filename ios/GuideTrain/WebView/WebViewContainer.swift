import SwiftUI
import WebKit

/// Hosts the GuideTrain web app (3D anatomy viewer, workout/progress panels,
/// everything) in a full-screen WKWebView. All product logic lives in the
/// web app under GuideTrain/Resources/www (synced from apps/web's `npm run
/// build:ios`); this is just the native shell around it.
///
/// Wrapped in a UIViewController (see WebViewController) rather than handed
/// to SwiftUI directly, so AuthBridge can drive the status bar's icon color
/// to match the web app's own theme via `preferredStatusBarStyle`.
struct WebViewContainer: UIViewControllerRepresentable {
    func makeCoordinator() -> Coordinator {
        Coordinator()
    }

    func makeUIViewController(context: Context) -> WebViewController {
        let configuration = WKWebViewConfiguration()
        configuration.setURLSchemeHandler(context.coordinator.schemeHandler, forURLScheme: LocalSchemeHandler.scheme)
        configuration.allowsInlineMediaPlayback = true

        // Registering the handler is enough on its own — WKWebView injects
        // window.webkit.messageHandlers.authBridge into every page itself,
        // which is exactly what apps/web/src/lib/nativeAuthBridge.ts checks
        // for and posts to. No injected shim script is needed to create it.
        let userContentController = WKUserContentController()
        userContentController.add(context.coordinator.authBridge, name: AuthBridge.messageHandlerName)
        configuration.userContentController = userContentController

        let webView = WKWebView(frame: .zero, configuration: configuration)
        webView.isOpaque = true
        webView.backgroundColor = UIColor(named: "LaunchBackground")
        webView.scrollView.bounces = false
        webView.allowsBackForwardNavigationGestures = true
        context.coordinator.authBridge.attach(to: webView)

        let controller = WebViewController(webView: webView)
        context.coordinator.authBridge.statusBarDelegate = controller

        let url = URL(string: "\(LocalSchemeHandler.scheme)://\(LocalSchemeHandler.host)/index.html")!
        webView.load(URLRequest(url: url))

        return controller
    }

    func updateUIViewController(_ uiViewController: WebViewController, context: Context) {}

    final class Coordinator {
        let schemeHandler = LocalSchemeHandler()
        let authBridge = AuthBridge()
    }
}
