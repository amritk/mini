import { callNativeAsync } from '@amritk/mini-lynx-native'

import { MODULE } from './native-module'
import type { ActionSheetOptions, ActionSheetResult } from './types'

/**
 * Shows the platform's own action sheet, and resolves with the row the user
 * chose.
 *
 * `UIAlertController` in the action-sheet style on iOS; an `AlertDialog` with a
 * list on Android. Both come with the things a sheet drawn in Lynx elements
 * does not have: the system's dismissal gestures, its dimming and its
 * accessibility behaviour, and — on iOS — the popover presentation an iPad
 * expects instead of a bottom sheet.
 *
 * ```ts
 * const result = await presentActionSheet({
 *   title: 'Photo',
 *   actions: [{ label: 'Replace' }, { label: 'Delete', destructive: true }],
 * })
 * if (result.ok) apply(result.index)
 * ```
 *
 * ## The index you get back is the index you passed
 *
 * `result.index` is a position in your own `actions` array, disabled rows
 * counted. That is deliberate and both native halves are held to it: an index
 * that shifted when a row was disabled would silently apply the wrong action,
 * and it would only do so in the states where a row happened to be disabled.
 *
 * Cancelling is `{ ok: false, reason: 'dismissed' }`, and so is a tap outside
 * the sheet or an Android back gesture. The cancel row is never an index.
 *
 * ## One dialog at a time, on purpose
 *
 * A call made while another dialog from this package is up resolves
 * `{ ok: false, reason: 'busy' }` and changes nothing on screen. The
 * alternative is worse than it sounds: iOS refuses to present a second modal
 * over an unfinished one and logs a warning nobody reads, so the promise would
 * simply never settle, and Android stacks dialogs into something the user has
 * to dismiss twice. A `busy` result is the one outcome of the three that a
 * caller can actually see and handle.
 *
 * In practice this fires when a double tap sends two presentations, and the
 * right response is usually to ignore it.
 *
 * ## iPad needs an anchor
 *
 * On iPad an action sheet is a popover, and UIKit throws if a popover has no
 * source rectangle. The native side will not let that crash happen — with no
 * `anchor` it centres the popover and hides the arrow — but a sheet that grows
 * out of the control the user actually touched is the reason to pass one. It is
 * ignored on Android and on iPhone.
 *
 * @example
 * ```tsx
 * <text
 *   bindtap={async (event) => {
 *     const result = await presentActionSheet({
 *       actions: [{ label: 'Share' }, { label: 'Remove', destructive: true }],
 *       anchor: { x: event.detail.x, y: event.detail.y },
 *     })
 *     if (result.ok) run(result.index)
 *   }}
 * >
 *   More
 * </text>
 * ```
 */
export const presentActionSheet = (options: ActionSheetOptions): Promise<ActionSheetResult> =>
  callNativeAsync<ActionSheetResult>(MODULE, 'presentActionSheet', options)
