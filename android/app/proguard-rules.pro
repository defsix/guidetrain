# The web app calls into AuthBridge/DisplayBridge (see MainActivity's
# addJavascriptInterface calls) through WebView's reflection-based JS
# interface — R8 must not rename or strip those classes/methods, or the web
# app's calls into window.GuideTrainAuthBridge/AndroidDisplayBridge silently
# stop working with no compile-time error to catch it.
-keepattributes JavascriptInterface
-keepclassmembers class me.guidetrain.app.auth.AuthBridge {
    public *;
}
-keepclassmembers class me.guidetrain.app.DisplayBridge {
    public *;
}
