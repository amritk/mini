plugins {
  id("com.android.library")
  id("org.jetbrains.kotlin.android")
}

// Plugin VERSIONS are deliberately absent: an autolinked library declares which
// plugins it needs and the host app's build decides which versions everything
// compiles with. Pinning them here would fight whatever the host resolved.
// `../android-check/settings.gradle.kts` supplies them for the compile check.

android {
  namespace = "dev.amritk.minilynx.notifications"
  compileSdk = 35

  defaultConfig {
    // POST_NOTIFICATIONS is a 33+ concept and every use of it is version-guarded
    // at runtime, so the floor is set by Lynx rather than by this library.
    minSdk = 23
  }

  compileOptions {
    sourceCompatibility = JavaVersion.VERSION_17
    targetCompatibility = JavaVersion.VERSION_17
  }

  kotlin {
    compilerOptions {
      jvmTarget.set(org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17)
    }
  }
}

dependencies {
  compileOnly("org.lynxsdk.lynx:lynx:4.0.1")
  implementation("androidx.core:core-ktx:1.13.1")

  // Remote push only. `compileOnly` so an app that wants nothing but local
  // notifications does not inherit Firebase: the messaging service is reachable
  // only through an intent filter Firebase itself dispatches, so with no
  // Firebase on the classpath the class is never loaded and never missed.
  //
  // An app that DOES want remote push adds the real dependency and the
  // google-services plugin itself — see this package's README.
  compileOnly("com.google.firebase:firebase-messaging:24.0.0")
}
