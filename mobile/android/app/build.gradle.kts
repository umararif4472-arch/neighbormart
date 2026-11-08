plugins {
    id("com.android.application")
    // The Flutter Gradle Plugin must be applied after the Android and Kotlin Gradle plugins.
    id("dev.flutter.flutter-gradle-plugin")
}

android {
    namespace = "com.neighbormart.app"
    compileSdk = flutter.compileSdkVersion
    ndkVersion = flutter.ndkVersion

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    defaultConfig {
        // Application ID for NeighborMart (renamed from Borrow Don't Buy on 2026-11-08).
        applicationId = "com.neighbormart.app"
        minSdk = flutter.minSdkVersion
        targetSdk = flutter.targetSdkVersion
        // Version comes from pubspec.yaml.
        versionCode = flutter.versionCode
        versionName = flutter.versionName
    }

    signingConfigs {
        getByName("debug") {
            // The project's FIXED debug keystore, committed at
            // mobile/android/debug.keystore on purpose (standard debug
            // credentials). Its SHA-1 (01:77:91:51...C0:D4) is the one
            // registered in Firebase, so Google Sign-In works in these
            // builds. Pinned explicitly: relying on the default
            // ~/.android/debug.keystore location proved unreliable in
            // CI (each runner signed with a freshly generated key).
            storeFile = file("../debug.keystore")
            storePassword = "android"
            keyAlias = "androiddebugkey"
            keyPassword = "android"
        }
    }

    buildTypes {
        release {
            // Test builds: signed with the fixed debug key above so the
            // APK installs directly and keeps the registered SHA-1.
            // Add a real release keystore before any store release.
            signingConfig = signingConfigs.getByName("debug")
        }
    }
}

kotlin {
    compilerOptions {
        jvmTarget = org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17
    }
}

flutter {
    source = "../.."
}
