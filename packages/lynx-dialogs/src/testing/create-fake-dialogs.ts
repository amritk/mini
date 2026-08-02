import type {
  ActionSheetOptions,
  ActionSheetResult,
  AlertButton,
  AlertOptions,
  AlertResult,
  DatePickerOptions,
  DatePickerResult,
  DialogDismissReason,
} from '../types'

/** What the fake module currently has on screen. */
export type FakePresentation =
  | { readonly kind: 'datePicker'; readonly options: DatePickerOptions }
  | { readonly kind: 'actionSheet'; readonly options: ActionSheetOptions }
  | { readonly kind: 'alert'; readonly options: AlertOptions }

/** The fake module, plus the handles a test needs to play the user's part. */
export type FakeDialogs = {
  /** Register this under `MODULE` in the registry handed to `installNativeBridge`. */
  readonly module: Readonly<Record<string, unknown>>
  /** What is on screen, or null. */
  presented(): FakePresentation | null
  /**
   * Confirms the date picker with an instant, as tapping the confirm button
   * would. Throws when nothing is up, or when the value is one the platform
   * would not have offered.
   */
  confirmDate(value: number): void
  /**
   * Chooses a row of the action sheet, as tapping it would. Throws when nothing
   * is up, or when the row is one the platform would not let the user reach.
   */
  chooseAction(index: number): void
  /**
   * Presses a button on the alert. Throws when nothing is up, or when the index
   * names no button.
   */
  chooseButton(index: number): void
  /**
   * Cancels whatever is up, as a back press, an outside tap or a swipe down
   * would.
   *
   * Worth remembering when the presentation is an alert: on iOS this cannot
   * happen, because an alert has no route out except its own buttons. The fake
   * allows it because Android does, and because `dismissActiveDialog` produces
   * it on both.
   */
  cancel(): void
  /**
   * Whether the host can present at all. True by default; false is a device
   * with no resumed Activity or no key window, which is what `unavailable`
   * reports.
   */
  setPresentable(presentable: boolean): void
}

/**
 * An in-memory stand-in for the native dialogs module.
 *
 * The point of this is not to test the facade's plumbing — that is three lines
 * per function and the bridge's own suite already covers the wire. It is that
 * **the two native implementations cannot be run here at all**, so the contract
 * between JavaScript and native is otherwise pinned by nothing. This fake is
 * that contract, executable: it implements the same method names, arities and
 * call forms the Kotlin and the Objective-C do, and the suite drives the real
 * facade against it.
 *
 * What it emphatically does **not** verify is that the Kotlin and the
 * Objective-C match it. Nothing in this repository can — see `AGENTS.md`.
 *
 * ## It reproduces the platforms rather than smoothing them over
 *
 * A second presentation while one is up is refused rather than queued, because
 * that is what iOS does with it. A disabled row cannot be chosen and a value
 * outside the picker's bounds cannot be confirmed — not because this fake
 * validates them, but because a device would never have offered them, and a
 * fake that let a test drive an impossible answer would be pinning behaviour
 * the app can never actually reach.
 *
 * Those two throw rather than returning a failure, which is the one place this
 * fake deliberately steps out of character: reaching them means the *test* is
 * wrong, and a thrown message naming the row is worth more than a plausible
 * result that quietly proves nothing.
 *
 * What it does not model is anything about how the dialogs look or animate —
 * `title`, `confirmLabel`, `minuteInterval` and `anchor` are recorded for a test
 * to assert were passed, and no more. Those belong to UIKit and to Android's
 * dialog theming, and a fake that invented its own version would be asserting
 * against itself.
 *
 * @example
 * ```ts
 * const dialogs = createFakeDialogs()
 * installNativeBridge({ peer, emitter, modules: { [MODULE]: dialogs.module } })
 *
 * const pending = presentDatePicker({ mode: 'date' })
 * await settle()
 * dialogs.confirmDate(1_700_000_000_000)
 * expect(await pending).toEqual({ ok: true, value: 1_700_000_000_000 })
 * ```
 */
export const createFakeDialogs = (): FakeDialogs => {
  let presentable = true

  /** The one presentation slot, and the callback waiting on it. */
  let current: FakePresentation | null = null
  let answer: ((result: DatePickerResult | ActionSheetResult | AlertResult) => void) | null = null

  const failure = (reason: DialogDismissReason, message: string) => ({ ok: false, reason, message }) as const

  /**
   * Settles the pending presentation and clears the slot.
   *
   * The slot is cleared *before* the callback runs, because a caller may
   * present again the moment its promise settles and a slot still holding the
   * finished dialog would refuse that one as `busy` — a bug that only shows up
   * in the back-to-back case, which is exactly how these get used.
   */
  const settle = (result: DatePickerResult | ActionSheetResult | AlertResult): void => {
    const done = answer
    current = null
    answer = null
    done?.(result)
  }

  /** The guard every `present*` method shares. Returns false when it has already answered. */
  const canPresent = (done: (result: never) => void): boolean => {
    if (!presentable) {
      done(failure('unavailable', 'there is no window to present from') as never)
      return false
    }
    // Refused rather than queued, and the dialog already up is left alone —
    // iOS will not present a second modal over an unfinished one, so a queue
    // here would be modelling something the device cannot do.
    if (current !== null) {
      done(failure('busy', `a ${current.kind} is already presented`) as never)
      return false
    }
    return true
  }

  const module = {
    presentDatePicker: (options: DatePickerOptions, done: (result: DatePickerResult) => void) => {
      if (!canPresent(done as (result: never) => void)) return
      current = { kind: 'datePicker', options }
      answer = done as (result: DatePickerResult | ActionSheetResult | AlertResult) => void
    },

    presentActionSheet: (options: ActionSheetOptions, done: (result: ActionSheetResult) => void) => {
      if (!canPresent(done as (result: never) => void)) return
      current = { kind: 'actionSheet', options }
      answer = done as (result: DatePickerResult | ActionSheetResult | AlertResult) => void
    },

    presentAlert: (options: AlertOptions, done: (result: AlertResult) => void) => {
      if (!canPresent(done as (result: never) => void)) return
      // Refused before the slot is claimed, because an iOS alert with no buttons
      // has no way out at all — the user would be stuck on it. Read through a
      // widened view because `AlertButtons` is a one-to-three tuple, and
      // TypeScript is right that a typed caller cannot get here: the check is
      // for the one who cast, and it is here because being wrong ends the
      // session.
      if ((options.buttons as readonly AlertButton[]).length === 0) {
        done(failure('unavailable', 'an alert needs at least one button') as never)
        return
      }
      current = { kind: 'alert', options }
      answer = done as (result: DatePickerResult | ActionSheetResult | AlertResult) => void
    },

    dismissActiveDialog: () => {
      if (current === null) return
      settle(failure('dismissed', 'dismissed by the app'))
    },
  } satisfies Record<string, unknown>

  /** The presentation a test is trying to answer, or a message naming what went wrong. */
  const expect = <K extends FakePresentation['kind']>(kind: K): Extract<FakePresentation, { kind: K }> => {
    if (current === null) throw new Error(`no dialog is presented, so it cannot be answered as a ${kind}`)
    if (current.kind !== kind) throw new Error(`a ${current.kind} is presented, not a ${kind}`)
    return current as Extract<FakePresentation, { kind: K }>
  }

  return {
    module,
    presented: () => current,

    confirmDate: (value) => {
      const { options } = expect('datePicker')
      // Bounds are enforced on the two modes that actually have them. A time
      // picker's bounds are ignored by both platforms, and a fake that enforced
      // them would let a test prove a rule no device applies.
      const bounded = (options.mode ?? 'date') !== 'time'
      if (bounded && options.minimum !== undefined && value < options.minimum) {
        throw new Error(`${value} is before the picker's minimum of ${options.minimum}, so it could not be chosen`)
      }
      if (bounded && options.maximum !== undefined && value > options.maximum) {
        throw new Error(`${value} is after the picker's maximum of ${options.maximum}, so it could not be chosen`)
      }
      settle({ ok: true, value })
    },

    chooseAction: (index) => {
      const { options } = expect('actionSheet')
      const action = options.actions[index]
      if (action === undefined) {
        throw new Error(`the sheet has ${options.actions.length} actions, so index ${index} could not be chosen`)
      }
      if (action.disabled) throw new Error(`"${action.label}" is disabled, so it could not be chosen`)
      settle({ ok: true, index })
    },

    chooseButton: (index) => {
      const { options } = expect('alert')
      const button = options.buttons[index]
      if (button === undefined) {
        throw new Error(`the alert has ${options.buttons.length} buttons, so index ${index} could not be pressed`)
      }
      settle({ ok: true, index })
    },

    cancel: () => {
      if (current === null) throw new Error('no dialog is presented, so it cannot be cancelled')
      settle(failure('dismissed', 'cancelled by the user'))
    },

    setPresentable: (next) => {
      presentable = next
    },
  }
}
