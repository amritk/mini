import { installNativeBridge } from '@amritk/mini-lynx-native/background'

/**
 * The background chunk.
 *
 * Lynx runs `NativeModules` and `GlobalEventEmitter` **only** here, and this
 * runtime renders only on the main thread — so an app that touches native code
 * has its two halves in two chunks of the same bundle, and this is the far end
 * of the wire. `installNativeBridge()` is the whole of this side; calls made
 * from the main thread before it runs are queued rather than lost, which
 * matters because the engine calls `renderPage` first.
 *
 * Nothing in the starter app calls a native module yet. The file is here
 * because a missing background chunk is invisible until something does, and
 * because the two-chunk shape is the part of a Lynx app that has no equivalent
 * on the web to compare it to. `lynx.config.ts` is what points the build at it.
 */
installNativeBridge()
