import { callNativeAsync } from '@amritk/mini-lynx-native'

import { MODULE } from './native-module'
import type { LocationResult, PositionOptions } from './types'

/**
 * Asks for one fix and resolves with it, or with why there was not one.
 *
 * The result is a discriminated union rather than a throw — see `LocationResult`
 * for why — so the shape of every call site is the same: check `ok`, then use
 * `position` or branch on `error`.
 *
 * ## This can take seconds, and sometimes never finishes
 *
 * A cold radio indoors at `high` accuracy is the worst case and it is not rare.
 * That is what `timeout` is for, and why it defaults to something finite rather
 * than waiting forever: a spinner that never resolves is the failure mode this
 * API exists to make impossible.
 *
 * If an approximate answer would do, set `maximumAge`. A device that has any
 * recent fix — from any app — answers immediately instead of powering up a
 * provider, which is the difference between an instant map and a three-second
 * one.
 *
 * ## Permission is yours to handle first
 *
 * Calling this without permission resolves `{ ok: false, error:
 * 'permissionDenied' }`; it does **not** prompt. Prompting as a side effect of
 * a read would spend the one-shot system dialog at a moment you did not choose.
 *
 * @example
 * ```ts
 * const position = signal<LocationFix | null>(null)
 *
 * const locate = async () => {
 *   if ((await getPermissionStatus()) === 'undetermined') await requestPermission()
 *   const result = await getCurrentPosition({ accuracy: 'high', maximumAge: 30_000 })
 *   if (result.ok) position(result.position)
 * }
 * ```
 */
export const getCurrentPosition = (options: PositionOptions = {}): Promise<LocationResult> =>
  callNativeAsync<LocationResult>(MODULE, 'getCurrentPosition', options)
