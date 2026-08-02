/**
 * `@amritk/lynx-dialogs` — the platform's own date picker and action sheet, for
 * Lynx.
 *
 * Lynx ships neither. There is no picker element, no modal module, and the two
 * things published against the gap do not fill it: `@lynx-js/lynx-ui-sheet`
 * draws a sheet out of ReactLynx elements rather than presenting a native one,
 * and `@sigx/lynx-datetime-picker` is a real native picker bolted to another
 * framework's bridge. So this is an Android module, an iOS module, and a
 * promise-shaped facade that reaches them.
 *
 * ## What you have to wire up
 *
 * Two things, once each.
 *
 * ```ts
 * // 1. background chunk — the bridge that carries every call
 * import { installNativeBridge } from '@amritk/mini-lynx-native/background'
 *
 * installNativeBridge()
 * ```
 *
 * ```tsx
 * // 2. anywhere on the main thread — the app itself
 * import { presentActionSheet, presentAlert, presentDatePicker } from '@amritk/lynx-dialogs'
 *
 * const date = await presentDatePicker({ mode: 'date', maximum: Date.now() })
 * if (date.ok) console.log(new Date(date.value))
 *
 * const choice = await presentActionSheet({ actions: [{ label: 'Copy' }, { label: 'Delete', destructive: true }] })
 * if (choice.ok) run(choice.index)
 *
 * const confirm = await presentAlert({
 *   title: 'Delete this photo?',
 *   buttons: [{ label: 'Cancel', style: 'cancel' }, { label: 'Delete', style: 'destructive' }],
 * })
 * if (confirm.ok && confirm.index === 1) remove()
 * ```
 *
 * The native side links itself: `lynx.lib.json` declares the Android and iOS
 * sources and Lynx's autolinking picks them up. Unlike the other native
 * packages here there is **no permission and no `Info.plist` key** to add —
 * showing a dialog is not a capability either platform gates.
 *
 * ## Why a native module for something you could draw
 *
 * Because the parts that make a picker feel right are the parts you cannot
 * draw: the wheel's deceleration and its haptics, the calendar's locale and
 * first-day-of-week, the iPad popover an action sheet turns into, the system
 * dismissal gestures, and every accessibility behaviour a screen reader user
 * relies on. A sheet built out of Lynx elements gets none of them and has to
 * re-earn each one badly.
 *
 * The cost is a thread hop and a promise, which is what everything in
 * `@amritk/mini-lynx-native` costs.
 *
 * ## One dialog at a time
 *
 * This package will only ever have one presentation on screen. A second call
 * while one is up resolves `{ ok: false, reason: 'busy' }` rather than stacking
 * or hanging — see `presentActionSheet` for what the alternatives actually do
 * on each platform.
 *
 * ## Why there are no signals here
 *
 * The same reason `@amritk/lynx-location` gives: a second edge onto the signal
 * engine is how a consumer ends up with two reactive graphs that cannot see
 * each other's writes. The surface is promises, and an app wires one into
 * whichever graph it already has in a line.
 *
 * It also means the package works unchanged from ReactLynx, Vue Lynx, or plain
 * background-thread code, which a signals-shaped API would not.
 */
export { areDialogsAvailable } from './are-dialogs-available'
export { dismissActiveDialog } from './dismiss-active-dialog'
export { MODULE } from './native-module'
export { presentActionSheet } from './present-action-sheet'
export { presentAlert } from './present-alert'
export { presentDatePicker } from './present-date-picker'
export type {
  ActionSheetAnchor,
  ActionSheetItem,
  ActionSheetOptions,
  ActionSheetResult,
  AlertButton,
  AlertButtonStyle,
  AlertButtons,
  AlertOptions,
  AlertResult,
  DatePickerMode,
  DatePickerOptions,
  DatePickerResult,
  DialogDismissReason,
} from './types'
