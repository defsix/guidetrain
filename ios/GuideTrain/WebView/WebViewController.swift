import UIKit
import WebKit

/// Hosts the WKWebView inside a plain UIViewController rather than handing
/// it directly to SwiftUI, so the status bar's icon color can be driven by
/// the web app's own theme (see AuthBridge.setStatusBarAppearance) via
/// `preferredStatusBarStyle`, the same problem the Android app solves with
/// its WindowInsetsController bridge.
final class WebViewController: UIViewController {
    let webView: WKWebView
    private var preferLightContent = true

    override var preferredStatusBarStyle: UIStatusBarStyle {
        preferLightContent ? .darkContent : .lightContent
    }

    init(webView: WKWebView) {
        self.webView = webView
        super.init(nibName: nil, bundle: nil)
    }

    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        webView.frame = view.bounds
        webView.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        view.addSubview(webView)
    }

    /// - Parameter isLightBackground: true when the page's current
    ///   background is light (so the status bar needs dark icons).
    func setStatusBarAppearance(isLightBackground: Bool) {
        preferLightContent = isLightBackground
        setNeedsStatusBarAppearanceUpdate()
    }
}
