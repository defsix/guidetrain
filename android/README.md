# GuideTrain — Android

A Kotlin Android app that packages the existing web app (`../apps/web`) and
shows it in a full-screen `WebView`. There's no separate native UI or
reimplemented logic — the 3D anatomy viewer, workout/progress panels, plans,
5/3/1 progression, and all ten languages are the same React/Three.js code
that runs on the live site. The one thing that genuinely needed native code
is Google sign-in, covered below.

## How it's wired together

- `app/build.gradle.kts` defines Gradle tasks (`npmInstall`, `buildWebApp`,
  `syncWebAssets`) that run `npm run build:android -w apps/web` from the
  repo root and copy the output into `app/src/main/assets/www` before every
  build. That folder is gitignored — it's regenerated, not hand-edited.
  GuideTrain is an npm workspace (unlike a single-app repo), so these tasks
  run from the repo root with `-w apps/web` rather than treating the web
  app's own directory as the repo root.
- `npm run build:android` (see `apps/web/package.json`) builds with
  `vite --mode android`, which switches `apps/web/vite.config.ts` to
  relative asset paths (`./assets/...`) instead of the domain-root paths
  used for the deployed site at guidetrain.me.
- `MainActivity.kt` serves those bundled assets through
  `androidx.webkit.WebViewAssetLoader` at
  `https://appassets.androidplatform.net/assets/www/` (the library's
  `DEFAULT_DOMAIN`) rather than a `file://` URL, so `fetch()` calls to
  Supabase see a real HTTPS origin and behave the same as they do on the
  deployed site.
- The activity calls `enableEdgeToEdge()` and draws the WebView under the
  system status/navigation bars, rather than leaving Android to reserve a
  plain, solid-colour strip there. Since Android's WebView doesn't support
  CSS `env(safe-area-inset-*)` the way WKWebView on iOS does, `MainActivity`
  measures the real system bar insets
  (`ViewCompat.OnApplyWindowInsetsListener`) and forwards them into the
  page as `--safe-area-top` / `--safe-area-bottom` CSS custom properties
  (`injectSafeAreaInsets`, re-applied on every page load too) — the same
  two properties `apps/web/src/index.css` already falls back to using
  `env()` for everywhere else.

## OAuth sign-in

Google refuses to show its consent screen inside an embedded `WebView`
("disallowed_useragent") — there's no workaround for that from inside the
WebView itself, so this needed a small native hand-off:

- `apps/web/src/lib/nativeAuthBridge.ts` detects the native bridge and calls
  `supabase.auth.signInWithOAuth` with `skipBrowserRedirect: true`, getting
  back the authorize URL Supabase would otherwise have navigated to, and
  hands it to `window.GuideTrainAuthBridge.startOAuth(url)` instead.
  `apps/web/src/state/useAuth.ts`'s `signInWithOAuth` is the only function
  that changed on the web side — `AccountPanel.tsx` calls it exactly as
  before.
- `auth/AuthBridge.kt` (a `@JavascriptInterface`) opens that URL in a
  **Chrome Custom Tab** (`androidx.browser.customtabs`) — a real first-party
  browser tab, not the embedded WebView. This is Google's own documented fix
  for `disallowed_useragent`.
- The OAuth `redirectTo` is set to `guidetrain://auth-callback`, registered
  as an intent-filter in `AndroidManifest.xml`. When the provider redirects
  there, Android routes it back into the already-running app
  (`android:launchMode="singleTask"` on `MainActivity`) via `onNewIntent`,
  which reloads the WebView at its own origin/path
  (`.../assets/www/index.html`) with the callback's query string attached —
  the same origin that called `signInWithOAuth`, so Supabase's PKCE
  `exchangeCodeForSession` finds its stored code verifier in `localStorage`
  exactly as it would after a real browser redirect.

**One manual step, not code:** add `guidetrain://auth-callback` to the
Supabase project's **Authentication → URL Configuration → Redirect URLs**
allow-list. Without it, Supabase's `/authorize` endpoint rejects the
`redirectTo` value and OAuth fails with a dashboard-side error, not a bug in
this code.

## Release signing & distribution

GuideTrain is distributed **only via GitHub Releases** — sideload the APK
directly, no Play Store. The `release` build type is R8-minified
(`isMinifyEnabled = true`); the two `@JavascriptInterface` classes the web
app calls into (`AuthBridge`, `DisplayBridge`) are kept via
`proguard-rules.pro` — R8 has no way to know WebView will call them
reflectively, so without that rule a minified build would silently break
every native bridge call with no compile error.

Signing is optional and never committed:

- **Locally:** generate a keystore (`keytool -genkeypair -v -keystore release.jks -keyalg RSA -keysize 2048 -validity 10000 -alias guidetrain-release`),
  copy [`keystore.properties.example`](keystore.properties.example) to
  `keystore.properties` (gitignored) and fill in the real paths/passwords,
  then `./gradlew assembleRelease` produces a signed `.apk`.
- **In CI:** [`android-build.yml`](../.github/workflows/android-build.yml)
  also builds `assembleRelease` on every push/PR. Set these repo secrets
  once a real release keystore exists — `ANDROID_KEYSTORE_BASE64`
  (`base64 -w0 release.jks`), `ANDROID_KEYSTORE_PASSWORD`,
  `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD` — and the workflow decodes and
  signs with it automatically.
- **Without either:** the release build type falls back to debug signing, so
  `assembleRelease` still succeeds on ordinary branch/PR builds (useful for
  smoke-testing the minified build shape) — **except** on a tagged release
  push (`v*`), where a missing keystore secret fails the build instead of
  silently publishing a debug-signed APK as "the" signed release.

**Cutting a release:** bump `versionCode`/`versionName` in
`app/build.gradle.kts` (must increase, or Android refuses to update over an
existing install), commit, then `git tag v1.0 && git push --tags`. CI builds
the signed APK and publishes it — plus a `.sha256` checksum — to a GitHub
Release matching the tag. This coexists with the rolling
`android-debug-latest` prerelease (unsigned debug build from every push to
`main`); the tagged release is the one that shows up as "Latest".

## Building

Prerequisites: Android Studio (or the command-line SDK) and Node.js — Node
is needed because the build pulls in the web app automatically.

```bash
cd android
./gradlew assembleDebug     # builds the web app, syncs assets, builds the APK
./gradlew installDebug      # ...and installs it on a connected device/emulator
```

Or just open the `android/` folder in Android Studio and run it.

### Prebuilt APK via CI

[`.github/workflows/android-build.yml`](../.github/workflows/android-build.yml)
builds a debug APK on every push/PR that touches the app (and on demand via
"Run workflow"). Grab it from the workflow run's **Artifacts** section
(`guidetrain-debug-apk`) without needing a local Android SDK.

**Stable download link:** every push to `main` also republishes the APK to a
rolling GitHub Release, so this URL always points at the latest build (unlike
the per-run artifact link above, which expires after ~90 days):

```
https://github.com/defsix/guidetrain/releases/download/android-debug-latest/app-debug.apk
```

or browse it at <https://github.com/defsix/guidetrain/releases/tag/android-debug-latest>.

## Known limitation of this change

This Android project's Gradle build **was** actually run in the sandbox that
built it: the Android SDK command-line tools were installed here
(`platform-tools`, `platforms;android-34`, `build-tools;34.0.0`), and both
`./gradlew assembleDebug` and `./gradlew assembleRelease` (R8-minified,
debug-signed since no real keystore exists in this sandbox) completed
successfully, producing real APKs — this is real compile verification, not
a documentation-only claim. What it does **not** cover: there is no
emulator or device in this sandbox, so nothing about `AuthBridge`'s Custom
Tabs hand-off, `DisplayBridge`'s status bar behavior, or the WebView's
actual rendering of the 3D anatomy viewer has been run or seen on screen.
Treat the first real install (`./gradlew installDebug` on a device or
emulator, or CI's `android-build.yml` artifact) as the real first test of
runtime behavior, and the first real OAuth sign-in attempt as the first test
of the Custom Tabs redirect round-trip end to end.
