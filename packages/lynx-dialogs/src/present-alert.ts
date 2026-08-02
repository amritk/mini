import { callNativeAsync } from '@amritk/mini-lynx-native'

import { MODULE } from './native-module'
import type { AlertOptions, AlertResult } from './types'

/**
 * Shows the platform's own alert — a title, a message and up to three buttons —
 * and resolves with the button the user pressed.
 *
 * `UIAlertController` in the alert style on iOS; an `AlertDialog` with buttons
 * on Android.
 *
 * ```ts
 * const result = await presentAlert({
 *   title: 'Delete this photo?',
 *   message: 'This cannot be undone.',
 *   buttons: [{ label: 'Cancel', style: 'cancel' }, { label: 'Delete', style: 'destructive' }],
 * })
 * if (result.ok && result.index === 1) remove()
 * ```
 *
 * ## Alert or action sheet?
 *
 * An alert interrupts: it is centred, it is about the thing the user just did,
 * and it asks a question with a small number of answers. An action sheet
 * offers: it comes from the edge, it is about the thing the user is pointing
 * at, and it lists what can be done to it.
 *
 * The practical test is the button count. Three is the most an alert can have
 * on Android — see `AlertButtons` — so anything longer is a sheet, and this
 * package makes that a type error rather than a surprise on one platform.
 *
 * ## An iOS alert has no way out except its buttons
 *
 * It cannot be tapped away, swiped away, or dismissed with a gesture. That is
 * why `buttons` is a non-empty tuple, and why both native halves refuse to
 * present an empty one rather than trusting the type: an iOS alert with no
 * buttons is an app the user cannot get out of.
 *
 * The reverse holds on Android, where the back gesture and a tap outside both
 * cancel — so `{ ok: false, reason: 'dismissed' }` is a real outcome there and
 * effectively never one on iOS. Handle it anyway; `dismissActiveDialog`
 * produces it on both.
 *
 * ## Where the buttons end up
 *
 * The array's order is the left-to-right order on Android, which fills its
 * negative, neutral and positive slots in that order. iOS lays them out its own
 * way — two side by side, three or more stacked — and moves the `cancel` one
 * regardless of where you put it. So order the array for reading, and never for
 * position.
 *
 * ## One dialog at a time
 *
 * A call made while another dialog from this package is on screen resolves
 * `{ ok: false, reason: 'busy' }` immediately, and the dialog already up is
 * left alone. See `presentActionSheet` for why that is the rule.
 *
 * @example
 * ```ts
 * const confirmed = async (): Promise<boolean> => {
 *   const result = await presentAlert({
 *     title: 'Discard changes?',
 *     buttons: [{ label: 'Keep editing', style: 'cancel' }, { label: 'Discard', style: 'destructive' }],
 *   })
 *   // A dismissal is a "no", which is the safe reading of every way out that
 *   // is not a button press.
 *   return result.ok && result.index === 1
 * }
 * ```
 */
export const presentAlert = (options: AlertOptions): Promise<AlertResult> =>
  callNativeAsync<AlertResult>(MODULE, 'presentAlert', options)
