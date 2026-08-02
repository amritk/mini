/*
 * A standalone Gradle project whose only job is to COMPILE the library in
 * `../android`, so CI can prove the Kotlin builds.
 *
 * It lives outside `android/` on purpose. That directory is what Lynx's
 * autolinker hands to a host app's Gradle build, and a `settings.gradle.kts`
 * sitting inside it would either be shipped in the npm tarball or picked up as
 * a nested build. Keeping the harness beside it leaves the library exactly as a
 * consumer sees it.
 *
 * The plugin versions live here rather than in the library's own
 * `build.gradle.kts` for the same reason a real consumer's do: an autolinked
 * library declares which plugins it needs and the host app decides which
 * versions everything is built with. Pinning them in the library would fight
 * whatever the host already resolved.
 */
pluginManagement {
  repositories {
    google()
    mavenCentral()
    gradlePluginPortal()
  }
  plugins {
    id("com.android.library") version "8.7.3"
    id("org.jetbrains.kotlin.android") version "2.0.21"
  }
}

dependencyResolutionManagement {
  repositories {
    google()
    mavenCentral()
  }
}

rootProject.name = "lynx-dialogs-android-check"

include(":dialogs")

project(":dialogs").projectDir = file("../android")
