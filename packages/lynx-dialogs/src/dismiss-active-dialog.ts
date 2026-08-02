import { callNative } from '@amritk/mini-lynx-native'

import { MODULE } from './native-module'

/**
 * Closes whatever dialog this package currently has on screen, as if the user
 * had cancelled it.
 *
 * The presentation's own promise settles with
 * `{ ok: false, reason: 'dismissed' }` — the same value a cancel button
 * produces — so a caller awaiting it does not need to know this happened. With
 * nothing on screen this does nothing.
 *
 * ## What it is for
 *
 * A screen that navigates away while a sheet is open. The dialog belongs to the
 * platform's window rather than to the Lynx view, so nothing tears it down when
 * the component that opened it goes away, and the user is left with a sheet
 * over the wrong screen. Registering this with `onCleanup` is the fix:
 *
 * ```tsx
 * import { onCleanup } from '@amritk/mini-lynx'
 *
 * onCleanup(() => void dismissActiveDialog())
 * ```
 *
 * ## The promise it returns says nothing about the dialog
 *
 * It resolves when the call has crossed the bridge, not when the dialog has
 * finished animating away — the dismissal happens on the platform's UI thread
 * and the two are not the same moment. Await the *presentation's* promise if
 * you need to know it is over; that one settles exactly once, whichever way the
 * dialog ended.
 */
export const dismissActiveDialog = (): Promise<void> => callNative<void>(MODULE, 'dismissActiveDialog')
