/**
 * The background chunk.
 *
 * Lynx runs `NativeModules` and `GlobalEventEmitter` only here, and this
 * runtime renders only on the main thread, so the two halves of an app that
 * touches native code live in two different chunks of the same bundle. The
 * build wires them: `pluginMiniLynx({ background: './src/background.ts' })`.
 *
 * `installNativeBridge` is the whole of this side. Calls made from the
 * main-thread chunk before it runs are queued rather than lost, which matters
 * because the engine calls `renderPage` first.
 */

import { installNativeBridge } from '@amritk/mini-lynx-native/background'

installNativeBridge()
