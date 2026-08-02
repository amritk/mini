/*
 * Keeps Gradle's output out of the library directory.
 *
 * `../android` is shipped in the npm tarball and is what Lynx's autolinker
 * hands to a host app, so a `build/` and a `.gradle/` appearing inside it after
 * a compile check would be published artefacts of the check itself. Redirecting
 * the build directory here means the library directory comes out of a build
 * exactly as it went in.
 */
subprojects {
  layout.buildDirectory.set(rootProject.layout.buildDirectory.dir(name))
}
