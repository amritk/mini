import {
  type ActionSheetOptions,
  type AlertOptions,
  areDialogsAvailable,
  type DatePickerOptions,
  dismissActiveDialog,
  presentActionSheet,
  presentAlert,
  presentDatePicker,
} from '@amritk/lynx-dialogs'
import type { FakePresentation } from '@amritk/lynx-dialogs/testing'
import { type LynxElement, onCleanup, signal } from '@amritk/mini-lynx'
import { For, Show } from '@amritk/mini-lynx/flow'

import { Action, Chip, Panel, Prose, Readout, Row, Stack, TextLine } from '../components'
import { fakeDevice } from '../lib/fake-device'

/**
 * `/dialogs` — `@amritk/lynx-dialogs`, the platform's own date picker, action
 * sheet and alert.
 *
 * `UIDatePicker` in a sheet and `UIAlertController` on iOS; `DatePickerDialog`,
 * `TimePickerDialog` and `AlertDialog` on Android. The reason to reach for
 * these rather than build them is that they are the controls the user already
 * knows how to operate, and they come with the platform's accessibility and
 * localisation rather than with yours.
 *
 * ## The dialog you see below is not one of them
 *
 * It is drawn by this screen, out of `view` and `text`, from whatever the
 * package's own fake reports as presented. That is the only honest way to
 * preview this in a browser: there is no `UIAlertController` here, so rather
 * than pretend, the panel at the top shows exactly the options that crossed the
 * bridge and offers the answers a device would have allowed.
 *
 * Which makes the boundary unusually clear on this screen. Everything above the
 * fold — the options, the results, the `busy` rule, the tuple that stops at
 * three — is the shipping contract. Everything about how it looks is invented
 * here and will look nothing like a phone.
 */
export const DialogsScreen = (): LynxElement => {
  const device = fakeDevice()
  const log = signal<readonly string[]>([])

  const record = (line: string): void => log([line, ...log()])

  /** What the fake has on screen. Reads the revision, so it re-runs when the wire moves. */
  const presented = (): FakePresentation | null => {
    device.revision()
    return device.dialogs.presented()
  }

  // The dialog outlives the component that opened it — it belongs to the
  // platform's window, not to this tree — so navigating away has to close it.
  // Without this, leaving this tab with a sheet up leaves a sheet up.
  onCleanup(() => void dismissActiveDialog())

  return (
    <Stack gap="md">
      <Prose>
        Everything here settles rather than rejects: cancelling comes back as a result with `ok: false` and a reason of
        `dismissed`, not as a throw. Branch on `ok` before reading `value` or `index` — TypeScript will insist, and code
        that casts around it reads `undefined` on the path most users take.
      </Prose>

      <Surface presented={presented} record={record} />
      <Pickers record={record} />
      <Sheets record={record} />
      <Alerts record={record} />
      <OneAtATime record={record} />
      <Results log={log} />
    </Stack>
  )
}

type RecordProps = {
  record: (line: string) => void
}

type SurfaceProps = RecordProps & {
  presented: () => FakePresentation | null
}

/**
 * The preview's stand-in for the platform's window.
 *
 * Presented over the app rather than inline in it — `position: fixed`, from
 * `styles.css` — because that is the one thing about a dialog that is not
 * decoration. A card sitting at the top of a long screen is something the user
 * has to go and find, which is exactly what a platform dialog exists not to be.
 *
 * The answers it offers are limited to ones a device would actually have
 * offered: a disabled row cannot be chosen and a date outside the picker's
 * bounds cannot be confirmed, because the package's fake throws on those rather
 * than answering. That is deliberate on its part — reaching them means the
 * *caller* is driving something the platform cannot produce.
 */
const Surface = (props: SurfaceProps): LynxElement => {
  const device = fakeDevice()

  /**
   * The presentation, when it is of one particular kind.
   *
   * Narrowing in a getter rather than in the JSX because `Show` hands its child
   * a getter for the value that satisfied `when` — so the branch reads the live
   * options rather than the ones that happened to be up when it was built.
   */
  const kindOf = <K extends FakePresentation['kind']>(
    kind: K,
  ): (() => Extract<FakePresentation, { kind: K }> | null) => {
    return () => {
      const current = props.presented()
      return current?.kind === kind ? (current as Extract<FakePresentation, { kind: K }>) : null
    }
  }

  const datePicker = kindOf('datePicker')
  const actionSheet = kindOf('actionSheet')
  const alert = kindOf('alert')

  return (
    <Panel
      title="On screen"
      blurb="Present anything below and it appears over the app, above the tab bar. It is drawn by this screen out of view and text, from what the fake module reports as presented — a device draws the platform's own control there, and it looks nothing like this."
    >
      <Show
        when={props.presented}
        fallback={() => <TextLine class="card-meta">nothing is presented — the platform's window is free</TextLine>}
      >
        {() => (
          <view class="dialog-surface gap-sm">
            <TextLine class="dialog-surface-title">presented by the platform</TextLine>
            <Show when={datePicker}>{(picker) => <DatePickerSurface options={() => picker().options} />}</Show>
            <Show when={actionSheet}>{(sheet) => <SheetSurface options={() => sheet().options} />}</Show>
            <Show when={alert}>{(dialog) => <AlertSurface options={() => dialog().options} />}</Show>

            <Row gap="xs">
              <Action
                onTap={() => {
                  device.dialogs.cancel()
                  props.record('the user dismissed it')
                }}
              >
                dismiss it
              </Action>
              <Action
                onTap={() => {
                  void dismissActiveDialog()
                  props.record('dismissActiveDialog()')
                }}
              >
                dismissActiveDialog()
              </Action>
            </Row>
          </view>
        )}
      </Show>
      <Prose>
        Dismissing from the app and dismissing by hand produce the same result — `dismissed` — which is the right answer
        for both: the user did not choose anything either way. On iOS an alert genuinely cannot be dismissed, having no
        route out but its own buttons, while Android's back gesture cancels it; handle `dismissed` on an alert anyway
        and treat it as "no".
      </Prose>
    </Panel>
  )
}

/** The date picker, as the options that crossed plus the confirmations they allow. */
const DatePickerSurface = (props: { options: () => DatePickerOptions }): LynxElement => {
  const device = fakeDevice()
  const value = (): number => props.options().value ?? Date.now()

  /** Whether the picker would let the user land on this instant at all. */
  const allowed = (candidate: number): boolean => {
    const { mode = 'date', minimum, maximum } = props.options()
    if (mode === 'time') return true
    return (minimum === undefined || candidate >= minimum) && (maximum === undefined || candidate <= maximum)
  }

  const choose = (candidate: number): void => {
    if (allowed(candidate)) device.dialogs.confirmDate(candidate)
  }

  return (
    <Stack gap="xs">
      <TextLine>{() => `${props.options().title ?? 'Date picker'} · mode ${props.options().mode ?? 'date'}`}</TextLine>
      <Readout>{() => JSON.stringify(props.options(), null, 1)}</Readout>
      <Row gap="xs">
        <Action onTap={() => choose(value())} disabled={() => !allowed(value())}>
          confirm as-is
        </Action>
        <Action onTap={() => choose(value() + 86_400_000)} disabled={() => !allowed(value() + 86_400_000)}>
          confirm + 1 day
        </Action>
        <Action onTap={() => choose(value() - 86_400_000)} disabled={() => !allowed(value() - 86_400_000)}>
          confirm − 1 day
        </Action>
      </Row>
      <TextLine class="card-meta">
        A greyed button is a date the picker's own bounds put out of reach, which is the whole of what `minimum` and
        `maximum` do.
      </TextLine>
    </Stack>
  )
}

/**
 * The action sheet, as rows — disabled ones drawn and unpressable, exactly as
 * the platform draws them.
 *
 * The rows are keyed by label as well as by position. A `For` row is built once
 * from the item it was handed and is never rebuilt for a new one, so keying by
 * position alone would let a later sheet inherit an earlier sheet's labels —
 * which cannot happen today, because the branch is torn down between
 * presentations, but is one refactor away from being able to.
 */
const SheetSurface = (props: { options: () => ActionSheetOptions }): LynxElement => {
  const device = fakeDevice()
  const rows = (): readonly (ActionSheetOptions['actions'][number] & { index: number })[] =>
    props.options().actions.map((action, index) => ({ ...action, index }))

  return (
    <Stack gap="xs">
      <TextLine>{() => props.options().title ?? 'Action sheet'}</TextLine>
      <Show when={() => props.options().message !== undefined}>
        {() => <TextLine class="card-meta">{() => props.options().message ?? ''}</TextLine>}
      </Show>
      <For each={rows} key={(row) => `${row.index}:${row.label}`} as="view" class="gap-xs">
        {(row) => (
          <Action
            onTap={() => {
              if (!row.disabled) device.dialogs.chooseAction(row.index)
            }}
            disabled={row.disabled === true}
          >
            {`${row.index}: ${row.label}${row.destructive ? ' (destructive)' : ''}`}
          </Action>
        )}
      </For>
      <TextLine class="card-meta">{() => props.options().cancelLabel ?? 'Cancel'}</TextLine>
    </Stack>
  )
}

/** The alert, as its one-to-three buttons. */
const AlertSurface = (props: { options: () => AlertOptions }): LynxElement => {
  const device = fakeDevice()
  const buttons = (): readonly { label: string; style?: string; index: number }[] =>
    props.options().buttons.map((button, index) => ({ ...button, index }))

  return (
    <Stack gap="xs">
      <TextLine>{() => props.options().title ?? 'Alert'}</TextLine>
      <Show when={() => props.options().message !== undefined}>
        {() => <TextLine class="card-meta">{() => props.options().message ?? ''}</TextLine>}
      </Show>
      <Row gap="xs">
        <For each={buttons} key={(button) => `${button.index}:${button.label}`}>
          {(button) => (
            <Action onTap={() => device.dialogs.chooseButton(button.index)}>
              {`${button.label}${button.style === undefined || button.style === 'default' ? '' : ` (${button.style})`}`}
            </Action>
          )}
        </For>
      </Row>
    </Stack>
  )
}

/** Presenting a picker, in the three modes and with bounds. */
const Pickers = (props: RecordProps): LynxElement => {
  const midnight = (): number => {
    const now = new Date()
    return new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  }

  const present = (label: string, options: DatePickerOptions): void => {
    void presentDatePicker(options).then((result) =>
      props.record(
        result.ok
          ? `${label} → ${new Date(result.value).toISOString()}`
          : `${label} → ${result.reason}: ${result.message}`,
      ),
    )
  }

  return (
    <Panel
      title="presentDatePicker"
      blurb="Epoch milliseconds in and epoch milliseconds out — never a Date, which crosses the bridge as an empty object because only JSON crosses at all."
    >
      <Row>
        <Action onTap={() => present('date', { mode: 'date', title: 'Ship on', value: midnight() })}>date</Action>
        <Action onTap={() => present('time', { mode: 'time', title: 'Remind me at', minuteInterval: 15 })}>time</Action>
        <Action onTap={() => present('datetime', { mode: 'datetime', title: 'Starts' })}>datetime</Action>
        <Action
          onTap={() =>
            present('bounded', {
              mode: 'date',
              title: 'Within the week',
              value: midnight(),
              minimum: midnight() - 86_400_000,
              maximum: midnight() + 86_400_000,
            })
          }
        >
          with bounds
        </Action>
      </Row>
      <Prose>
        The picker modifies the `value` you handed it rather than building a fresh instant: `date` keeps that value's
        time of day, `time` keeps its calendar day and zeroes the seconds, `datetime` does both. So presenting with no
        `value` and asking for a day gives you today with the current time of day still on it — pass a midnight if you
        want a clean day boundary, which is what the first button does.
      </Prose>
      <Prose>
        Bounds do nothing in `time` mode, on either platform, so a time outside the range you meant comes back anyway
        and validating it is yours. And `mode: 'datetime'` is two dialogs on Android — cancelling either cancels the
        whole thing — which is worth knowing before it reads badly in a flow that cannot afford a second step.
      </Prose>
    </Panel>
  )
}

/** The sheet, and the index that counts rows the user could not press. */
const Sheets = (props: RecordProps): LynxElement => {
  const actions: ActionSheetOptions['actions'] = [
    { label: 'Duplicate' },
    { label: 'Archive', disabled: true },
    { label: 'Delete', destructive: true },
  ]

  const present = (): void => {
    void presentActionSheet({
      title: 'Build #1428',
      message: 'What should happen to it?',
      actions,
      cancelLabel: 'Not now',
      anchor: { x: 24, y: 120, width: 44, height: 44 },
    }).then((result) =>
      props.record(
        result.ok ? `sheet → index ${result.index} (${actions[result.index]?.label})` : `sheet → ${result.reason}`,
      ),
    )
  }

  return (
    <Panel
      title="presentActionSheet"
      blurb="A list of what can be done to the thing the user is pointing at. More than three choices has to be this rather than an alert."
    >
      <Action onTap={present}>present a sheet</Action>
      <Prose>
        `index` is a position in the array you passed, disabled rows included. Filtering the array before passing it and
        then indexing into the filtered one is the bug that follows, and it is silent — it picks the wrong action rather
        than failing.
      </Prose>
      <Prose>
        The `anchor` is iPad-only and matters there: without one the popover is centred and arrowless rather than
        crashing, which is tidy but loses the point of a sheet, which is that it grows out of the control the user
        touched.
      </Prose>
    </Panel>
  )
}

/** The alert, and the tuple that will not let you build a fourth button. */
const Alerts = (props: RecordProps): LynxElement => {
  const present = (label: string, options: AlertOptions): void => {
    void presentAlert(options).then((result) =>
      props.record(result.ok ? `${label} → button ${result.index}` : `${label} → ${result.reason}`),
    )
  }

  return (
    <Panel
      title="presentAlert"
      blurb="An alert interrupts: centred, about what the user just did, a question with a very small number of answers."
    >
      <Row>
        <Action
          onTap={() =>
            present('one', { title: 'Saved', message: 'Your changes are on the server.', buttons: [{ label: 'OK' }] })
          }
        >
          one button
        </Action>
        <Action
          onTap={() =>
            present('two', {
              title: 'Delete this build?',
              message: 'This cannot be undone.',
              buttons: [
                { label: 'Cancel', style: 'cancel' },
                { label: 'Delete', style: 'destructive' },
              ],
            })
          }
        >
          two buttons
        </Action>
        <Action
          onTap={() =>
            present('three', {
              title: 'Unsaved changes',
              buttons: [
                { label: 'Cancel', style: 'cancel' },
                { label: 'Discard', style: 'destructive' },
                { label: 'Save' },
              ],
            })
          }
        >
          three buttons
        </Action>
      </Row>
      <Readout>
        {[
          'type AlertButtons =',
          '  | readonly [AlertButton]',
          '  | readonly [AlertButton, AlertButton]',
          '  | readonly [AlertButton, AlertButton, AlertButton]',
        ].join('\n')}
      </Readout>
      <Prose>
        A tuple rather than an array, because Android has exactly three button slots and there is no fourth. Building
        the list dynamically and casting gets you a dialog missing a choice on one platform — reach for an action sheet
        instead, which is what the cap is there to push you towards.
      </Prose>
      <Prose>
        At most one button may be `style: 'cancel'`; `UIAlertController` raises on a second. The native halves demote
        the extras rather than crashing, but the layout that comes back is not the one you meant.
      </Prose>
    </Panel>
  )
}

/** One window, one dialog — and what the second presentation gets. */
const OneAtATime = (props: RecordProps): LynxElement => {
  const device = fakeDevice()

  const presentTwice = (): void => {
    const options: AlertOptions = { title: 'First', buttons: [{ label: 'OK' }] }
    void presentAlert(options).then((result) =>
      props.record(`first → ${result.ok ? `button ${result.index}` : result.reason}`),
    )
    void presentAlert({ title: 'Second', buttons: [{ label: 'OK' }] }).then((result) =>
      props.record(`second → ${result.ok ? `button ${result.index}` : result.reason}`),
    )
  }

  const available = signal<boolean | null>(null)

  return (
    <Panel
      title="One at a time, and nowhere to present"
      blurb="A second presentation while one is up resolves `busy`. It does not queue, and it does not close the first."
    >
      <Row>
        <Action onTap={presentTwice}>present two at once</Action>
        <Action onTap={() => device.dialogs.setPresentable(false)}>lose the window</Action>
        <Action onTap={() => device.dialogs.setPresentable(true)}>get it back</Action>
        <Action onTap={() => void areDialogsAvailable().then(available)}>areDialogsAvailable()</Action>
        <Chip tone={() => (available() === true ? 'good' : 'neutral')}>
          {() => `linked: ${available() === null ? '—' : available()}`}
        </Chip>
      </Row>
      <Prose>
        Guard your double taps or ignore the second result — a `busy` that is treated as a dismissal will look to your
        code like the user said no. With no window to present from, which is a device with no resumed Activity or no key
        window, everything answers `unavailable` instead: a state worth telling apart from a dismissal, because the user
        was never asked anything.
      </Prose>
    </Panel>
  )
}

type ResultsProps = {
  log: () => readonly string[]
}

/** Everything the three functions answered, newest first. */
const Results = (props: ResultsProps): LynxElement => (
  <Panel title="What came back" blurb="Every result above, in order, with nothing filtered out.">
    <Show when={() => props.log().length > 0} fallback={() => <TextLine class="card-meta">nothing yet</TextLine>}>
      {() => <Readout>{() => props.log().slice(0, 10).join('\n')}</Readout>}
    </Show>
  </Panel>
)
