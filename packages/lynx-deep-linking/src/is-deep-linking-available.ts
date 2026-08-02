import { isNativeModuleAvailable } from '@amritk/mini-lynx-native'

import { MODULE } from './native-module'

/**
 * Answers whether the deep-linking native module is linked into this host app.
 *
 * A Lynx bundle can run inside a host that autolinked this library and a host
 * that did not — Lynx Explorer being the one every app meets first — and the
 * difference is invisible until something calls it. This is the check that
 * turns "the share button does nothing" into a branch you wrote.
 *
 * It says nothing about whether the host app declared a URL scheme, which is
 * the other half of being reachable and cannot be answered from here: a linked
 * module in an app with no `<intent-filter>` and no `CFBundleURLTypes` opens
 * URLs perfectly well and simply never receives one.
 */
export const isDeepLinkingAvailable = (): Promise<boolean> => isNativeModuleAvailable(MODULE)
