plugins {
  id("com.android.library")
  id("org.jetbrains.kotlin.android")
}

// Plugin VERSIONS are deliberately absent: an autolinked library declares which
// plugins it needs and the host app's build decides which versions everything
// compiles with. Pinning them here would fight whatever the host resolved.
// `../android-check/settings.gradle.kts` supplies them for the compile check.

android {
  namespace = "dev.amritk.minilynx.securestorage"
  compileSdk = 35

  defaultConfig {
    // 23 is the real floor and not a copied number: below it there is no
    // Keystore-backed AES at all — API 23 is where `KeyGenParameterSpec` and
    // AES key generation arrived — so a `MasterKey` on 21 or 22 would be an RSA
    // wrapping key over a key kept somewhere else, which is a different
    // security property wearing the same API. `androidx.security:security-crypto`
    // will build on 21 and this library will not, on purpose.
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

  // The first implementation dependency any package in this repository has, and
  // it is not taken lightly — `@amritk/lynx-dialogs` has none, and
  // `@amritk/lynx-location` refuses Play Services outright. The alternative
  // here is writing the envelope by hand: generate an AES key in the
  // AndroidKeyStore, drive GCM over every value, manage the IVs, and get the
  // key-rotation and key-invalidation cases right. That is a cryptographic
  // implementation living in a UI library, and this is the maintained one
  // Google ships for exactly this job.
  //
  // `implementation` rather than `compileOnly` because a host app has no reason
  // to know this is here: the API is the package's own, and Tink arrives
  // transitively as the dependency of a dependency should.
  implementation("androidx.security:security-crypto:1.1.0-alpha06")
}
