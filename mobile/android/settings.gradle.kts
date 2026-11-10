pluginManagement {
    val flutterSdkPath =
        run {
            val properties = java.util.Properties()
            file("local.properties").inputStream().use { properties.load(it) }
            val flutterSdkPath = properties.getProperty("flutter.sdk")
            require(flutterSdkPath != null) { "flutter.sdk not set in local.properties" }
            flutterSdkPath
        }

    includeBuild("$flutterSdkPath/packages/flutter_tools/gradle")

    repositories {
        google()
        mavenCentral()
        gradlePluginPortal()
    }
}

plugins {
    id("dev.flutter.flutter-plugin-loader") version "1.0.0"
    id("com.android.application") version "9.1.0" apply false
    id("org.jetbrains.kotlin.android") version "2.4.0" apply false
    // Processes google-services.json into Android resources (default_web_client_id
    // etc.). Without it Google Sign-In has no client ID at runtime and fails.
    id("com.google.gms.google-services") version "4.4.3" apply false
    // Crashlytics Gradle plugin (Wave 2, Workstream F): processes the
    // Crashlytics mapping/symbol metadata for firebase_crashlytics.
    // Version per the current Firebase Crashlytics Android docs.
    id("com.google.firebase.crashlytics") version "3.0.8" apply false
}

include(":app")
