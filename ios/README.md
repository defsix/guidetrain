# GuideTrain — iOS

A Swift/SwiftUI iOS app that packages the existing web app (`../apps/web`)
and shows it in a full-screen `WKWebView`, the same approach as the
[Android app](../android/README.md). There's no separate native UI or
reimplemented logic — the 3D anatomy viewer, workout/progress panels, plans,
5/3/1 progression, and all ten languages are the same React/Three.js code
that runs on the live site. The one thing that genuinely needed native code
is Google sign-in, covered below.

## How it's wired together

- **No `.xcodeproj` is committed.** [`project.yml`](project.yml) is an
  [XcodeGen](https://github.com/yonaskolb/XcodeGen) spec; running
  `xcodegen generate` produces `GuideTrain.xcodeproj` deterministically. This
  avoids the merge-conflict-prone, hand-edited `.pbxproj` file — regenerate
  it any time from `project.yml`.
- A "Sync Web Assets" Run Script build phase
  ([`Scripts/sync-web-assets.sh`](Scripts/sync-web-assets.sh)) runs
  `npm run build:ios -w apps/web` from the repo root before every build and
  copies the output into `GuideTrain/Resources/www`. That folder is
  gitignored — it's regenerated, not hand-edited. GuideTrain is an npm
  workspace (unlike a single-app repo), so this script's paths go through
  `apps/web/` rather than treating the web app's own directory as the repo
  root.
- `npm run build:ios` (see `apps/web/package.json`) builds with
  `vite --mode ios`, which switches `apps/web/vite.config.ts` to relative
  asset paths (`./assets/...`) instead of the domain-root paths used for the
  deployed site at guidetrain.me — the same mechanism the Android build uses.
- **Custom `app://` scheme instead of `file://`.**
  [`LocalSchemeHandler.swift`](GuideTrain/WebView/LocalSchemeHandler.swift)
  serves the bundled assets under `app://local/...` via `WKURLSchemeHandler`.
  `file://` pages send `Origin: null` on `fetch()`, which some CORS setups
  reject even when they otherwise allow `*`; a custom scheme gives the
  Supabase API calls a stable, non-null origin instead — the same reason the
  Android build uses `WebViewAssetLoader`'s synthetic https origin rather
  than `file://`. It also knows to serve `.glb` (the 3D anatomy model) as
  `model/gltf-binary`, the one asset type this app ships that a plain
  web-clock app wouldn't have needed.
- **Status-bar-aware view controller.**
  [`WebViewContainer.swift`](GuideTrain/WebView/WebViewContainer.swift) is a
  `UIViewControllerRepresentable` (not the simpler `UIViewRepresentable`)
  wrapping [`WebViewController.swift`](GuideTrain/WebView/WebViewController.swift),
  so `AuthBridge` can drive `preferredStatusBarStyle` at runtime to match the
  web app's own theme — see below.

## OAuth sign-in

Google refuses to show its consent screen inside an embedded `WKWebView`
("disallowed_useragent") — there's no workaround for that from inside the
WebView itself, so this needed a small native hand-off, mirroring the
Android app's Custom Tabs approach:

- `apps/web/src/lib/nativeAuthBridge.ts` detects the native bridge (here,
  `window.webkit.messageHandlers.authBridge`, which `WKWebView` injects
  automatically once the handler is registered — no injected shim script
  needed) and calls `supabase.auth.signInWithOAuth` with
  `skipBrowserRedirect: true`, getting back the authorize URL Supabase would
  otherwise have navigated to, and posts it as a `startOAuth` message.
  `apps/web/src/state/useAuth.ts`'s `signInWithOAuth` is the only function
  that changed on the web side — `AccountPanel.tsx` calls it exactly as
  before.
- [`AuthBridge.swift`](GuideTrain/WebView/AuthBridge.swift) (a
  `WKScriptMessageHandler`) presents that URL via `ASWebAuthenticationSession`
  — Apple's documented mechanism for exactly this case —
  with `callbackURLScheme: "guidetrain"` and
  `prefersEphemeralWebBrowserSession = false` (so an existing Google session
  in Safari carries over rather than forcing a fresh sign-in every time).
- The OAuth `redirectTo` is set to `guidetrain://auth-callback`. Once the
  session captures that callback, `AuthBridge` reloads the main `WKWebView`
  at its own origin/path (`app://local/index.html`) with the callback's
  query string attached — the same origin that called `signInWithOAuth`, so
  Supabase's PKCE `exchangeCodeForSession` finds its stored code verifier in
  `localStorage` exactly as it would after a real browser redirect. This is
  fire-and-forget from the JS side — unlike a typical bridge call, there's
  no return value to hand back across the message-handler boundary; native
  does the whole round trip on its own.
- A `CFBundleURLTypes` entry for `guidetrain://` is registered in
  [`Info.plist`](GuideTrain/Supporting/Info.plist) as a resilience fallback,
  even though `ASWebAuthenticationSession` doesn't strictly require it (its
  `callbackURLScheme` interception happens before the OS would otherwise
  need to route the URL as an ordinary deep link).

**One manual step, not code:** add `guidetrain://auth-callback` to the
Supabase project's **Authentication → URL Configuration → Redirect URLs**
allow-list. Without it, Supabase's `/authorize` endpoint rejects the
`redirectTo` value and OAuth fails with a dashboard-side error, not a bug in
this code.

## Building

Prerequisites: a Mac with Xcode, [XcodeGen](https://github.com/yonaskolb/XcodeGen)
(`brew install xcodegen`), and Node.js (needed because the build pulls in
the web app automatically).

```bash
cd ios
xcodegen generate       # produces GuideTrain.xcodeproj from project.yml
open GuideTrain.xcodeproj
```

Then just build and run from Xcode (⌘R) — the "Sync Web Assets" build phase
builds the web app and refreshes `GuideTrain/Resources/www` automatically.
Re-run `xcodegen generate` any time `project.yml` changes.

**App icon:** `Assets.xcassets/AppIcon.appiconset` ships a single
1024×1024 "universal" image (Xcode generates every other required size
from it) — the same bolt mark as `apps/web/src/components/Logo.tsx`, drawn
programmatically rather than exported from the SVG. Swap it for real
artwork whenever you have some; Xcode's asset catalog compiler requires
*some* `AppIcon` image to exist for any build to succeed at all (a real
`actool` error this project actually hit, not just a lint warning), so
this is a placeholder that keeps builds green rather than optional polish.

### Prebuilt Simulator app via CI

[`.github/workflows/ios-build.yml`](../.github/workflows/ios-build.yml) builds
an **unsigned iOS Simulator app** on GitHub's macOS runners on every push/PR
that touches the app (and on demand via "Run workflow"), and uploads it as a
zipped artifact (`guidetrain-ios-simulator`). Download it, unzip, then either
drag `GuideTrain.app` onto a running Simulator window or install it with
`xcrun simctl install booted GuideTrain.app`.

This is **not** a device-installable `.ipa`: no Apple Developer signing
certificate or provisioning profile is configured for this repo, so real
devices need those set up first (see below).

### Building a real-device `.ipa`

To get something installable on a physical iPhone, you need your own Apple
Developer Program membership. Locally, that's just a matter of opening
`GuideTrain.xcodeproj` in Xcode, setting your team under Signing &
Capabilities, and building for a connected device or archiving
(Product → Archive). To do it in CI instead, you'd add your signing
certificate (as a base64-encoded `.p12` secret) and provisioning profile to
this repo's GitHub Actions secrets and extend `ios-build.yml` to import them
and build/export with `CODE_SIGNING_ALLOWED=YES` and a real team ID — not
wired up in this repo yet, since it requires credentials only the app's
actual owner has.

## Known limitation of this change

This was written in a sandboxed Linux environment with no Xcode, no iOS
Simulator, and no Swift toolchain at all, so none of this — not the project
generation, not the Swift code, not the custom scheme handler, the
`ASWebAuthenticationSession` OAuth bridge, or the status-bar delegate —
could be compiled or run here. The web app's own `build:ios` script
(`vite build --mode ios`) was exercised as part of testing the Android side
(both native modes share the same `vite.config.ts` branch), but the iOS
project itself was not. Please treat the first `xcodegen generate` + build
in Xcode as the real first test, and expect to iron out a few rough edges.
In particular:

- The CORS behavior of the Supabase API under a custom scheme origin (see
  above) is a reasoned bet, not something verified against the real API here.
- The `ASWebAuthenticationSession` → callback → WKWebView reload round trip
  for OAuth follows Apple's documented `AuthenticationServices` APIs and
  mirrors Android's (verified) Custom Tabs equivalent, but hasn't been
  exercised against a real Google/Supabase OAuth flow.
- `UIViewControllerRepresentable`'s `preferredStatusBarStyle` propagation
  through SwiftUI's `WindowGroup` hosting hierarchy is a well-documented
  pattern, but hasn't been visually confirmed switching themes on-device.
- `LocalSchemeHandler`'s new `.glb` MIME-type case is untested against
  `AnatomyModel.jsx`'s actual `GLTFLoader`/`useGLTF` parsing path.
