import { isNativeModuleAvailable } from '@amritk/mini-lynx-native'

import { MODULE } from './native-module'

/**
 * Answers whether the dialogs native module is linked into this host app.
 *
 * A Lynx bundle can run inside a host that autolinked this library and a host
 * that did not, and the difference is invisible until something calls it. This
 * is the check that turns "the button does nothing" into a branch you wrote.
 *
 * It matters more here than it does for most modules, because the fallback is
 * real: a host without this can still ask for a date through ordinary Lynx
 * elements, so an app that checks can degrade to its own inline control instead
 * of losing the feature.
 *
 * A `true` here says the module is present, and nothing else. Whether there is
 * a window to present from is a question only the moment of presentation can
 * answer, and that arrives as `{ ok: false, reason: 'unavailable' }`.
 *
 * @example
 * ```ts
 * const pick = (await areDialogsAvailable()) ? presentDatePicker : showInlineCalendar
 * ```
 */
export const areDialogsAvailable = (): Promise<boolean> => isNativeModuleAvailable(MODULE)
