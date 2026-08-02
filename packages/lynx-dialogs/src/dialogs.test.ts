import { resetNativeChannel, setPeerContext } from '@amritk/mini-lynx-native'
import { installNativeBridge } from '@amritk/mini-lynx-native/background'
import { createFakeContexts, createFakeEmitter } from '@amritk/mini-lynx-native/testing'
import { afterEach, describe, expect, it } from 'vitest'

import { areDialogsAvailable } from './are-dialogs-available'
import { dismissActiveDialog } from './dismiss-active-dialog'
import { MODULE } from './native-module'
import { presentActionSheet } from './present-action-sheet'
import { presentAlert } from './present-alert'
import { presentDatePicker } from './present-date-picker'
import { createFakeDialogs, type FakeDialogs } from './testing/create-fake-dialogs'
import type { AlertButtons } from './types'

/**
 * These cases drive the real facade over the real bridge against the fake
 * native module, because the thing worth pinning is the contract between them:
 * the method names, their arities, and whether each is a returning or a
 * callback method. Get any of those wrong and the facade compiles, ships, and
 * fails on a device.
 *
 * They cannot tell you the Kotlin and the Objective-C agree with the fake.
 * Nothing here can — that is what `AGENTS.md` means by the device caveat.
 */

let uninstall: (() => void) | undefined

const setup = (): FakeDialogs => {
  const contexts = createFakeContexts()
  const dialogs = createFakeDialogs()
  setPeerContext(contexts.mainThread)
  uninstall = installNativeBridge({
    peer: contexts.background,
    emitter: createFakeEmitter(),
    modules: { [MODULE]: dialogs.module },
  })
  return dialogs
}

/** Lets the bridge's queued messages and the promises they settle drain. */
const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0))

/**
 * Presents something this case never intends to answer.
 *
 * `resetNativeChannel` in the teardown rejects every call still in flight,
 * which is the right thing for the bridge to do and an unhandled rejection
 * here. The cases that assert on a dialog *while it is up* are exactly the ones
 * that leave one, so they say so rather than each growing a `.catch`.
 */
const leaveOpen = (pending: Promise<unknown>): void => void pending.catch(() => undefined)

/** A fixed instant, so nothing here depends on when it runs. */
const NOON = Date.UTC(2026, 3, 20, 12, 0, 0)

afterEach(() => {
  uninstall?.()
  uninstall = undefined
  resetNativeChannel()
  setPeerContext(null)
})

describe('dialogs', () => {
  it('reports the module as available once it is linked', async () => {
    setup()
    await expect(areDialogsAvailable()).resolves.toBe(true)
  })

  it('reports the module as unavailable when the host app did not link it', async () => {
    const contexts = createFakeContexts()
    setPeerContext(contexts.mainThread)
    uninstall = installNativeBridge({
      peer: contexts.background,
      emitter: createFakeEmitter(),
      modules: {},
    })
    await expect(areDialogsAvailable()).resolves.toBe(false)
  })

  it('hands the date picker options across untouched', async () => {
    const dialogs = setup()
    const options = { mode: 'date', value: NOON, maximum: NOON, title: 'Pick a day' } as const

    leaveOpen(presentDatePicker(options))
    await settle()

    expect(dialogs.presented()).toEqual({ kind: 'datePicker', options })
  })

  it('resolves with the instant the user confirmed', async () => {
    const dialogs = setup()

    const pending = presentDatePicker({ mode: 'date', value: NOON })
    await settle()
    dialogs.confirmDate(NOON)

    await expect(pending).resolves.toEqual({ ok: true, value: NOON })
  })

  it('resolves as dismissed rather than rejecting when the user cancels', async () => {
    const dialogs = setup()

    const pending = presentDatePicker()
    await settle()
    dialogs.cancel()

    // The single most likely thing a user does with a dialog, and it has to be
    // a branch rather than an exception — see `DatePickerResult`.
    const result = await pending
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe('dismissed')
  })

  it('reports unavailable when there is nowhere to present from', async () => {
    const dialogs = setup()
    dialogs.setPresentable(false)

    const result = await presentDatePicker()
    expect(result).toEqual({ ok: false, reason: 'unavailable', message: expect.any(String) })
  })

  it('resolves with the index of the row the user chose', async () => {
    const dialogs = setup()

    const pending = presentActionSheet({ actions: [{ label: 'Copy' }, { label: 'Delete', destructive: true }] })
    await settle()
    dialogs.chooseAction(1)

    await expect(pending).resolves.toEqual({ ok: true, index: 1 })
  })

  it('keeps a row at its original index when an earlier row is disabled', async () => {
    const dialogs = setup()

    const pending = presentActionSheet({
      actions: [{ label: 'Edit', disabled: true }, { label: 'Share' }],
    })
    await settle()
    dialogs.chooseAction(1)

    // The index is a position in the array the caller passed, disabled rows
    // counted. A sheet that compacted its list would silently apply the wrong
    // action, and only in the states where a row happened to be disabled.
    await expect(pending).resolves.toEqual({ ok: true, index: 1 })
  })

  it('will not let a disabled row be chosen at all', async () => {
    const dialogs = setup()

    leaveOpen(presentActionSheet({ actions: [{ label: 'Archive', disabled: true }] }))
    await settle()

    // The fake refuses because a device would never have delivered the tap.
    // This is the assertion that keeps `disabled` from decaying into "greyed
    // out but still works".
    expect(() => dialogs.chooseAction(0)).toThrow(/disabled/)
  })

  it('refuses a second presentation while one is up, and leaves the first alone', async () => {
    const dialogs = setup()

    const first = presentDatePicker({ mode: 'date', value: NOON })
    await settle()
    const second = await presentActionSheet({ actions: [{ label: 'Copy' }] })

    expect(second).toEqual({ ok: false, reason: 'busy', message: expect.any(String) })
    // The dialog already on screen is untouched, which is the half of the rule
    // that is easy to lose: a `busy` that also closed the first one would make
    // a double tap destroy the interaction it duplicated.
    expect(dialogs.presented()).toEqual({ kind: 'datePicker', options: { mode: 'date', value: NOON } })

    dialogs.confirmDate(NOON)
    await expect(first).resolves.toEqual({ ok: true, value: NOON })
  })

  it('accepts the next presentation as soon as the previous one has settled', async () => {
    const dialogs = setup()

    const first = presentDatePicker()
    await settle()
    dialogs.cancel()
    await first

    // Back-to-back is how these actually get used — a sheet whose choice opens
    // a picker — so the slot has to be free by the time the first promise
    // settles rather than a tick later.
    const second = presentActionSheet({ actions: [{ label: 'Copy' }] })
    await settle()
    dialogs.chooseAction(0)

    await expect(second).resolves.toEqual({ ok: true, index: 0 })
  })

  it('resolves with the index of the alert button the user pressed', async () => {
    const dialogs = setup()

    const pending = presentAlert({
      title: 'Delete this photo?',
      buttons: [
        { label: 'Cancel', style: 'cancel' },
        { label: 'Delete', style: 'destructive' },
      ],
    })
    await settle()
    dialogs.chooseButton(1)

    await expect(pending).resolves.toEqual({ ok: true, index: 1 })
  })

  it('reports an alert with no buttons as unavailable rather than presenting it', async () => {
    const dialogs = setup()

    // Only reachable by casting past `AlertButtons`, and worth a case anyway:
    // an iOS alert has no dismissal gesture, so one with no buttons is a modal
    // the user can never leave. Both native halves refuse it the same way.
    const result = await presentAlert({ buttons: [] as unknown as AlertButtons })

    expect(result).toEqual({ ok: false, reason: 'unavailable', message: expect.any(String) })
    expect(dialogs.presented()).toBeNull()
  })

  it('treats an alert dismissal as a cancellation, which is Android only', async () => {
    const dialogs = setup()

    const pending = presentAlert({ buttons: [{ label: 'OK' }] })
    await settle()
    // The back gesture or a tap outside. iOS cannot produce this and Android
    // can, so a screen has to handle it either way — `AlertResult` says so.
    dialogs.cancel()

    const result = await pending
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe('dismissed')
  })

  it('holds the one slot across every kind of dialog', async () => {
    const dialogs = setup()

    leaveOpen(presentAlert({ buttons: [{ label: 'OK' }] }))
    await settle()

    // The slot is one per process, not one per kind — two dialogs of different
    // kinds on screen at once is exactly the stacking this rule exists to stop.
    const second = await presentDatePicker({ mode: 'date' })
    expect(second).toEqual({ ok: false, reason: 'busy', message: expect.any(String) })
    expect(dialogs.presented()?.kind).toBe('alert')
  })

  it('settles the pending presentation when the app dismisses it', async () => {
    const dialogs = setup()

    const pending = presentActionSheet({ actions: [{ label: 'Copy' }] })
    await settle()
    await dismissActiveDialog()

    const result = await pending
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe('dismissed')
    expect(dialogs.presented()).toBeNull()
  })

  it('does nothing when the app dismisses with no dialog up', async () => {
    setup()
    // A screen unmounting cannot know whether the sheet it opened is still
    // open, which is the whole reason `dismissActiveDialog` exists — so calling
    // it into an empty slot must not reject.
    await expect(dismissActiveDialog()).resolves.toBeUndefined()
  })

  it('will not let a value outside the picker bounds be confirmed', async () => {
    const dialogs = setup()

    leaveOpen(presentDatePicker({ mode: 'date', value: NOON, maximum: NOON }))
    await settle()

    expect(() => dialogs.confirmDate(NOON + 86_400_000)).toThrow(/maximum/)
  })

  it('lets a time picker answer outside its bounds, because both platforms do', async () => {
    const dialogs = setup()

    const pending = presentDatePicker({ mode: 'time', value: NOON, maximum: NOON })
    await settle()
    // `UIDatePicker` ignores its bounds in time mode and `TimePickerDialog` has
    // none, so a fake that enforced them here would let a test prove a rule no
    // device applies.
    dialogs.confirmDate(NOON + 3_600_000)

    await expect(pending).resolves.toEqual({ ok: true, value: NOON + 3_600_000 })
  })
})
