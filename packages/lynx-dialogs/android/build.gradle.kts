plugins {
  id("com.android.library")
  id("org.jetbrains.kotlin.android")
}

// Plugin VERSIONS are deliberately absent: an autolinked library declares which
// plugins it needs and the host app's build decides which versions everything
// compiles with. Pinning them here would fight whatever the host resolved.
// `../android-check/settings.gradle.kts` supplies them for the compile check.

android {
  namespace = "dev.amritk.minilynx.dialogs"
  compileSdk = 35

  defaultConfig {
    // `TextView.setTextAppearance(int)` and `Context.getColor(int)` are the
    // floor, both API 23. Everything else here — `AlertDialog`,
    // `DatePickerDialog`, `TimePickerDialog`, `ActivityLifecycleCallbacks` — is
    // older than that, so the real floor is Lynx's.
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

  // No implementation dependencies at all, and that is the point. A bottom
  // sheet would mean `com.google.android.material`, which brings a required
  // `Theme.Material3` on the host's Activity with it; `androidx.appcompat`
  // would mean the same argument one layer down. The framework's own
  // `AlertDialog` is themed by whatever the host app already uses, which is
  // what an app actually wants from a library's dialogs. Same restraint
  // `@amritk/lynx-location` shows in refusing Play Services.
}
