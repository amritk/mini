plugins {
  id("com.android.library")
  id("org.jetbrains.kotlin.android")
}

// Plugin VERSIONS are deliberately absent: an autolinked library declares which
// plugins it needs and the host app's build decides which versions everything
// compiles with. Pinning them here would fight whatever the host resolved.
// `../android-check/settings.gradle.kts` supplies them for the compile check.

android {
  namespace = "dev.amritk.minilynx.deeplinking"
  // 30 or above for `<queries>` to be understood rather than ignored; 35 to
  // match the rest of this repository's Android halves.
  compileSdk = 35

  defaultConfig {
    // Everything here is API 1 — intents, `ContentProvider`,
    // `ActivityLifecycleCallbacks` — so the floor is set by Lynx rather than by
    // this library.
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

  // No AndroidX, and no other dependency of any kind. Everything this library
  // does is platform API that has been there since API 1, so there is nothing
  // to pull into a host app's graph — which is the whole reason a linking
  // library can afford to be autolinked into everything.
}
