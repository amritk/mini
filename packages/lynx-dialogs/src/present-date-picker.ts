import { callNativeAsync } from '@amritk/mini-lynx-native'

import { MODULE } from './native-module'
import type { DatePickerOptions, DatePickerResult } from './types'

/**
 * Shows the platform's own date or time picker, and resolves with what the user
 * chose.
 *
 * `UIDatePicker` in a sheet on iOS; `DatePickerDialog` and `TimePickerDialog`
 * on Android. Nothing is drawn by this package — the point of reaching for a
 * native module at all is that the wheel scrolls, the haptics fire and the
 * calendar reads the way the rest of the device does, none of which a picker
 * built out of Lynx elements gets for free.
 *
 * The result is a discriminated union rather than a throw, so cancelling is a
 * branch instead of an exception:
 *
 * ```ts
 * const result = await presentDatePicker({ mode: 'date', value: Date.now() })
 * if (result.ok) setDeparture(new Date(result.value))
 * ```
 *
 * ## `datetime` is two dialogs on Android
 *
 * Android has never had a combined date-and-time widget, so `mode: 'datetime'`
 * presents `DatePickerDialog` and then `TimePickerDialog`, and the user sees
 * two steps where an iPhone user sees one. Cancelling **either** one cancels
 * the whole thing — a half-answered datetime is not a value worth handing back.
 *
 * This is a platform difference worth designing for rather than hiding: if the
 * two-step flow reads badly in your UI, ask for a date and a time from two
 * places in your own screen instead.
 *
 * ## Bounds do not apply to a time picker
 *
 * `minimum` and `maximum` are honoured in `date` and `datetime` modes. Neither
 * platform can enforce them on a bare time picker — `UIDatePicker` ignores its
 * bounds in `.time` mode, and `TimePickerDialog` has no bounds at all — so a
 * time picked outside a range you set will come back to you. Check it.
 *
 * ## One dialog at a time
 *
 * A call made while another dialog from this package is on screen resolves
 * `{ ok: false, reason: 'busy' }` immediately, and the dialog already up is
 * left alone. See `presentActionSheet` for why that is the rule.
 *
 * @example
 * ```ts
 * const birthday = signal<number | null>(null)
 *
 * const pick = async () => {
 *   const result = await presentDatePicker({
 *     mode: 'date',
 *     value: birthday() ?? Date.now(),
 *     maximum: Date.now(),
 *     title: 'Date of birth',
 *   })
 *   if (result.ok) birthday(result.value)
 * }
 * ```
 */
export const presentDatePicker = (options: DatePickerOptions = {}): Promise<DatePickerResult> =>
  callNativeAsync<DatePickerResult>(MODULE, 'presentDatePicker', options)
