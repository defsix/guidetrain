import WebKit

/// Serves the bundled web app (GuideTrain/Resources/www, synced from
/// apps/web's build) under a custom `app://` scheme rather than `file://`.
/// The Supabase API calls the web app makes are cross-origin fetches, and
/// some CORS configurations special-case and reject the `Origin: null`
/// header that `file://` pages send even when they otherwise allow `*`. A
/// custom scheme gives those fetches a stable, non-null origin instead —
/// the same reason the Android build serves its bundled assets over a
/// synthetic https origin (WebViewAssetLoader) rather than `file://`.
final class LocalSchemeHandler: NSObject, WKURLSchemeHandler {
    static let scheme = "app"
    static let host = "local"

    private let wwwDirectory: URL
    private let queue = DispatchQueue(label: "me.guidetrain.app.local-scheme-handler")
    private var cancelledTasks = Set<ObjectIdentifier>()

    override init() {
        guard let resourceURL = Bundle.main.resourceURL else {
            fatalError("Bundle has no resourceURL")
        }
        wwwDirectory = resourceURL.appendingPathComponent("www", isDirectory: true)
        super.init()
    }

    func webView(_ webView: WKWebView, start urlSchemeTask: WKURLSchemeTask) {
        guard let requestURL = urlSchemeTask.request.url else {
            urlSchemeTask.didFailWithError(URLError(.badURL))
            return
        }
        let taskID = ObjectIdentifier(urlSchemeTask)

        queue.async { [self] in
            guard !cancelledTasks.contains(taskID) else { return }

            var relativePath = requestURL.path
            if relativePath.isEmpty || relativePath == "/" {
                relativePath = "/index.html"
            }
            let fileURL = wwwDirectory.appendingPathComponent(String(relativePath.dropFirst()))

            guard let data = try? Data(contentsOf: fileURL) else {
                if !cancelledTasks.contains(taskID) {
                    urlSchemeTask.didFailWithError(URLError(.fileDoesNotExist))
                }
                return
            }

            guard !cancelledTasks.contains(taskID) else { return }

            let response = URLResponse(
                url: requestURL,
                mimeType: mimeType(for: fileURL.pathExtension),
                expectedContentLength: data.count,
                textEncodingName: "utf-8"
            )
            urlSchemeTask.didReceive(response)
            urlSchemeTask.didReceive(data)
            urlSchemeTask.didFinish()
            cancelledTasks.remove(taskID)
        }
    }

    func webView(_ webView: WKWebView, stop urlSchemeTask: WKURLSchemeTask) {
        let taskID = ObjectIdentifier(urlSchemeTask)
        queue.async { [self] in
            cancelledTasks.insert(taskID)
        }
    }

    private func mimeType(for pathExtension: String) -> String {
        switch pathExtension.lowercased() {
        case "html": return "text/html"
        case "js", "mjs": return "application/javascript"
        case "css": return "text/css"
        case "json": return "application/json"
        case "svg": return "image/svg+xml"
        case "png": return "image/png"
        case "jpg", "jpeg": return "image/jpeg"
        case "webp": return "image/webp"
        case "woff": return "font/woff"
        case "woff2": return "font/woff2"
        case "ico": return "image/x-icon"
        // GuideTrain's 3D anatomy viewer loads a .glb model (see
        // apps/web/src/anatomy/AnatomyModel.jsx's useGLTF call) — the one
        // asset type this handler serves that World Time never shipped.
        case "glb": return "model/gltf-binary"
        default: return "application/octet-stream"
        }
    }
}
