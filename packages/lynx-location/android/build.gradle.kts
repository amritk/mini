plugins {
  id("com.android.library")
  id("org.jetbrains.kotlin.android")
}

// Plugin VERSIONS are deliberately absent: an autolinked library declares which
// plugins it needs and the host app's build decides which versions everything
// compiles with. Pinning them here would fight whatever the host resolved.
// `../android-check/settings.gradle.kts` supplies them for the compile check.

android {
  namespace = "dev.amritk.minilynx.location"
  compileSdk = 35

  defaultConfig {
    // Everything here is either API 1 (`LocationManager`, `LocationListener`)
    // or version-guarded at the call site, so the floor is set by Lynx and by
    // `Activity.requestPermissions` rather than by this library.
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

  // The only real dependency, and only for `ContextCompat.checkSelfPermission`.
  // Nothing here reaches for `play-services-location`: the fused provider is
  // better at this, and taking it would push Play Services into every host app
  // that autolinks this library and lock out the devices without it. See
  // `LocationFixes.kt`.
  implementation("androidx.core:core-ktx:1.13.1")
}
