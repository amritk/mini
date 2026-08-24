/**
 * The background chunk of an app that has nothing to run in the background.
 *
 * A Lynx template carries two code slots and the engine loads both, so the
 * chunk exists whether or not the app put anything in it. An app that reaches
 * for `NativeModules` — through `@amritk/mini-lynx-native/background`, say —
 * passes its own module as the plugin's `background` option and this file is
 * never compiled into anything.
 */
export {}
