import org.gradle.api.tasks.Exec
import java.io.FileInputStream
import java.util.Properties

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

// Release signing is optional and never committed: populate
// android/keystore.properties (gitignored, see keystore.properties.example)
// for local release builds, or set the ANDROID_KEYSTORE_* env vars (as CI
// does, decoding a base64 secret to a temp file) for CI ones. Without
// either, the release build type falls back to debug signing further down
// so `assembleRelease` still works for smoke-testing the R8-minified build
// shape — just not for actual distribution (GuideTrain ships via signed
// APKs attached to GitHub Releases, not the Play Store).
val keystorePropertiesFile = rootProject.file("keystore.properties")
val keystoreProperties = Properties().apply {
    if (keystorePropertiesFile.exists()) load(FileInputStream(keystorePropertiesFile))
}

fun releaseSigningValue(propertyKey: String, envVar: String): String? =
    System.getenv(envVar) ?: keystoreProperties.getProperty(propertyKey)

val releaseStoreFile = releaseSigningValue("storeFile", "ANDROID_KEYSTORE_PATH")
val hasReleaseSigning = releaseStoreFile != null

// The Android app has no UI of its own: it ships the existing React/Three.js
// web app (apps/web, two levels up from here — android/app -> android ->
// repo root) as its assets and shows it in a WebView. These tasks build that
// web app and copy the output in before every Android build, so the two
// never drift out of sync. GuideTrain is an npm workspace (unlike a
// single-app repo), so npm commands run from the repo root with `-w
// apps/web` rather than from a web-app directory that doubles as the repo
// root.
val webAppDir = rootDir.parentFile
val webAppWorkspace = webAppDir.resolve("apps/web")
val webAssetsOutput = layout.projectDirectory.dir("src/main/assets/www")

val npmInstall by tasks.registering(Exec::class) {
    workingDir = webAppDir
    commandLine("npm", "ci")
    inputs.file(webAppDir.resolve("package-lock.json"))
    outputs.dir(webAppDir.resolve("node_modules"))
}

val buildWebApp by tasks.registering(Exec::class) {
    dependsOn(npmInstall)
    workingDir = webAppDir
    commandLine("npm", "run", "build:android", "-w", "apps/web")
    inputs.dir(webAppWorkspace.resolve("src"))
    inputs.file(webAppWorkspace.resolve("index.html"))
    inputs.dir(webAppWorkspace.resolve("public"))
    outputs.dir(webAppWorkspace.resolve("dist-android"))
}

val syncWebAssets by tasks.registering(Sync::class) {
    dependsOn(buildWebApp)
    from(webAppWorkspace.resolve("dist-android"))
    into(webAssetsOutput)
}

tasks.named("preBuild") {
    dependsOn(syncWebAssets)
}

android {
    namespace = "me.guidetrain.app"
    compileSdk = 34

    defaultConfig {
        applicationId = "me.guidetrain.app"
        minSdk = 26
        targetSdk = 34
        versionCode = 32
        versionName = "1.31"
    }

    signingConfigs {
        if (hasReleaseSigning) {
            create("release") {
                storeFile = file(releaseStoreFile!!)
                storePassword = releaseSigningValue("storePassword", "ANDROID_KEYSTORE_PASSWORD")
                keyAlias = releaseSigningValue("keyAlias", "ANDROID_KEY_ALIAS")
                keyPassword = releaseSigningValue("keyPassword", "ANDROID_KEY_PASSWORD")
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
            signingConfig = if (hasReleaseSigning) signingConfigs.getByName("release") else signingConfigs.getByName("debug")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
    }
}

// Renames the release APK from AGP's default app-release.apk to something
// that actually identifies the app and version once downloaded from a
// GitHub Release — "app-release.apk" is the same generic name every Android
// project produces, and would silently overwrite an older release's
// same-named download if both ended up in the same folder.
//
// VariantOutput.outputFileName is read-only (a Provider<String>); only the
// internal VariantOutputImpl exposes the mutable Property<String> version
// this needs, hence the cast — a known AGP Kotlin DSL wrinkle, not optional.
androidComponents {
    onVariants(selector().withBuildType("release")) { variant ->
        variant.outputs.forEach { output ->
            if (output is com.android.build.api.variant.impl.VariantOutputImpl) {
                output.outputFileName.set("guidetrain-v${android.defaultConfig.versionName}.apk")
            }
        }
    }
}

dependencies {
    implementation("androidx.core:core-ktx:1.13.1")
    implementation("androidx.appcompat:appcompat:1.7.0")
    implementation("androidx.activity:activity-ktx:1.9.0")
    implementation("androidx.webkit:webkit:1.11.0")
    // Custom Tabs — used only for the OAuth hand-off (see auth/AuthBridge.kt):
    // Google rejects its consent screen inside an embedded WebView, so that
    // one navigation goes to a real first-party browser tab instead.
    implementation("androidx.browser:browser:1.8.0")
}
