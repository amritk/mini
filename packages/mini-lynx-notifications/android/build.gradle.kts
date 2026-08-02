plugins {
  id("com.android.library")
  id("org.jetbrains.kotlin.android")
}

android {
  // Set through reflection so the same file works on Android Gradle Plugin
  // versions from before `namespace` existed, where the package comes from the
  // manifest instead. This is the shape Lynx's own library template uses.
  javaClass.methods.firstOrNull { it.name == "setNamespace" }
    ?.invoke(this, "dev.amritk.minilynx.notifications")
  compileSdkVersion(35)

  defaultConfig {
    // 23 matches Lynx's own library template. POST_NOTIFICATIONS is a 33+
    // concept and every use of it here is version-guarded at runtime.
    minSdkVersion(23)
  }

  compileOptions {
    sourceCompatibility = JavaVersion.VERSION_17
    targetCompatibility = JavaVersion.VERSION_17
  }
}

dependencies {
  implementation("org.lynxsdk.lynx:lynx:0.0.1-alpha.1")
  implementation("androidx.core:core-ktx:1.13.1")

  // Remote push only. `compileOnly` so an app that wants nothing but local
  // notifications does not inherit Firebase: the messaging service below is
  // reachable only through an intent filter Firebase itself dispatches, so with
  // no Firebase on the classpath the class is never loaded and never missed.
  //
  // An app that DOES want remote push adds the real dependency and the
  // google-services plugin itself — see this package's README.
  compileOnly("com.google.firebase:firebase-messaging:24.0.0")
}
