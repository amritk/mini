/**
 * `@amritk/mini-lynx-native/background` — the half that runs where the platform
 * actually is.
 *
 * One subpath for one job: `NativeModules` and `GlobalEventEmitter` exist only
 * in Lynx's background context, so the code that touches them has to live in
 * the background chunk. Nothing on the `.` entry imports this, so a main-thread
 * bundle never pulls it in.
 *
 * An app installs it in one line and then never thinks about it again:
 *
 * ```ts
 * import { installNativeBridge } from '@amritk/mini-lynx-native/background'
 *
 * installNativeBridge()
 * ```
 */
export {
  type InstallBridgeOptions,
  installNativeBridge,
} from './install-bridge'
export type { NativeEventEmitter, NativeModuleRegistry } from './native-globals'
