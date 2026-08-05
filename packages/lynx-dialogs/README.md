# @amritk/lynx-dialogs

**The platform's own date picker, action sheet and alert, for Lynx.** An Android
native module, an iOS native module, and a promise-shaped facade that reaches
them from a main-thread [`@amritk/mini-lynx`](../mini-lynx) tree.

```ts
import { presentActionSheet, presentAlert, presentDatePicker } from '@amritk/lynx-dialogs'

const date = await presentDatePicker({ mode: 'date', maximum: Date.now() })
if (date.ok) console.log(new Date(date.value))

const choice = await presentActionSheet({
  title: 'Photo',
  actions: [{ label: 'Replace' }, { label: 'Delete', destructive: true }],
})
if (choice.ok) apply(choice.index)

const confirm = await presentAlert({
  title: 'Delete this photo?',
  message: 'This cannot be undone.',
  buttons: [{ label: 'Cancel', style: 'cancel' }, { label: 'Delete', style: 'destructive' }],
})
if (confirm.ok && confirm.index === 1) remove()
```

## Why this exists

Lynx ships no picker element and no modal module, and the two things published
against the gap do not fill it:

- [`@lynx-js/lynx-ui-sheet`](https://www.npmjs.com/package/@lynx-js/lynx-ui-sheet)
  draws a sheet out of ReactLynx elements. It is a good component and it is not
  a native sheet — no system dismissal gestures, no iPad popover, and it is
  ReactLynx-only.
- [`@sigx/lynx-datetime-picker`](https://www.npmjs.com/package/@sigx/lynx-datetime-picker)
  *is* a real `UIDatePicker`/`DatePickerDialog`, bolted to another framework's
  bridge — it depends on `@sigx/lynx-core` and cannot be reached from here.

Nothing native exists for action sheets or alerts at all. Lynx's official answer
is "write native code and send it into your Lynx code", so that is what this is.

The parts that make these controls feel right are the parts you cannot draw: the
wheel's deceleration and haptics, the calendar's locale and first-day-of-week,
the popover an iPad expects instead of a bottom sheet, the system dismissal
gestures, and every accessibility behaviour a screen reader user relies on.

## Install

```sh
bun add @amritk/lynx-dialogs
```

`@amritk/mini-lynx-native` comes with it — it is the wire every call travels.

## JavaScript setup

One line, in your **background** chunk:

```ts
import { installNativeBridge } from '@amritk/mini-lynx-native/background'

installNativeBridge()
```

Without it every call queues forever and nothing says why. `NativeModules` is a
background-thread global and a `mini-lynx` tree renders on the main thread; the
bridge is what crosses between them.

## Host app setup

The native side links itself — `lynx.lib.json` declares the Android and iOS
sources and Lynx's autolinking picks them up.

**There is nothing else to do.** No permission, no `Info.plist` key, no manifest
entry: presenting a dialog is not a capability either platform gates. That is
the one way this package is simpler than
[`@amritk/lynx-notifications`](../lynx-notifications) and
[`@amritk/lynx-location`](../lynx-location), both of which need host-app
declarations before they will work at all.

If your build does not run Lynx's annotation processor, register by hand:

```kotlin
LynxEnv.inst().registerModule("MiniLynxDialogsModule", MiniLynxDialogsModule::class.java)
```

```objc
[config registerModule:MiniLynxDialogsModule.class];
```

## The surface

```ts
presentDatePicker(options?: DatePickerOptions): Promise<DatePickerResult>
presentActionSheet(options: ActionSheetOptions): Promise<ActionSheetResult>
presentAlert(options: AlertOptions): Promise<AlertResult>
dismissActiveDialog(): Promise<void>
areDialogsAvailable(): Promise<boolean>
```

### Which one

An **alert** interrupts: centred, about what the user just did, a question with
a small number of answers. An **action sheet** offers: from the edge, about what
the user is pointing at, a list of what can be done to it. The practical test is
the count — three buttons is Android's hard cap for an alert, so anything longer
is a sheet.

Every outcome is a discriminated union, never a rejection:

```ts
type DatePickerResult =
  | { ok: true; value: number }                                        // epoch milliseconds
  | { ok: false; reason: 'dismissed' | 'busy' | 'unavailable'; message: string }

type ActionSheetResult =
  | { ok: true; index: number }                                        // a position in `actions`
  | { ok: false; reason: 'dismissed' | 'busy' | 'unavailable'; message: string }

type AlertResult =
  | { ok: true; index: number }                                        // a position in `buttons`
  | { ok: false; reason: 'dismissed' | 'busy' | 'unavailable'; message: string }
```

Cancelling is the single most likely thing a user does with a dialog, so it is a
branch rather than an exception. `reason` is `'dismissed'` for a cancel button, a
tap outside, an Android back gesture and a swipe down on the iOS sheet alike.

## What differs between the platforms

Everything here is a real platform limit rather than a shortcut, and each is
documented at the option it affects.

| | iOS | Android |
| --- | --- | --- |
| `mode: 'datetime'` | one `UIDatePicker` | **two dialogs in sequence** — there has never been a combined widget |
| `minimum` / `maximum` | honoured in `date` and `datetime` | same — `TimePickerDialog` has no bounds |
| `minuteInterval` | `UIDatePicker.minuteInterval` | **ignored** — no equivalent exists |
| `use24HourClock` | a locale substitution, since `UIDatePicker` has no switch | passed straight to `TimePickerDialog` |
| `anchor` | positions the iPad popover | ignored — a dialog is centred by the window manager |
| default cancel label | localised by the system on the picker; English on the sheet | localised by the system |
| alert buttons | would stack any number; capped at three to match | **exactly three slots** — the API caps at three |
| alert dismissal | none — an alert has no gesture out, only its buttons | back gesture and tap outside both cancel |

Cancelling **either** step of an Android `datetime` cancels the whole thing. A
half-answered datetime is not a value worth handing back.

`AlertButtons` is a one-to-three tuple rather than an array, so the Android cap
is a type error instead of a button that quietly goes missing on half the
devices. At most one button may carry `style: 'cancel'` — `UIAlertController`
raises on a second, and the native side demotes extras rather than crashing.

## One dialog at a time

A presentation made while another is on screen resolves
`{ ok: false, reason: 'busy' }` and changes nothing. This is a rule the package
enforces rather than a limit it ran into — the alternatives are worse than they
sound. iOS refuses to present a second modal over an unfinished one and logs a
warning nobody reads, so the promise would simply never settle; Android stacks
dialogs into something the user has to dismiss twice.

In practice it fires when a double tap sends two presentations, and ignoring it
is usually right.

## Dismissing on navigation

A dialog belongs to the platform's window, not to the Lynx view, so nothing
tears it down when the component that opened it goes away:

```tsx
import { onCleanup } from '@amritk/mini-lynx'

onCleanup(() => void dismissActiveDialog())
```

The presentation's own promise then settles as `{ ok: false, reason: 'dismissed' }`.

## Testing without a device

`@amritk/lynx-dialogs/testing` exports the native module's contract as something
a test can drive:

```ts
import { createFakeDialogs } from '@amritk/lynx-dialogs/testing'
import { MODULE } from '@amritk/lynx-dialogs'

const dialogs = createFakeDialogs()
installNativeBridge({ peer, emitter, modules: { [MODULE]: dialogs.module } })

const pending = presentDatePicker({ mode: 'date' })
dialogs.confirmDate(Date.now())      // or dialogs.cancel(), which is the branch worth testing
```

`chooseAction(index)` answers a sheet, `chooseButton(index)` answers an alert,
and `presented()` says what is on screen.

It reproduces the platforms rather than smoothing them over: a second
presentation is refused, a disabled row cannot be chosen, a value outside the
picker's bounds cannot be confirmed, and an alert with no buttons is refused
rather than presented.

## No signals here

The surface is promises, deliberately. A second edge onto the signal engine is
how a consumer ends up with two reactive graphs that cannot see each other's
writes, and wiring a promise into whichever graph you already have is one line.
It also means this works unchanged from ReactLynx, Vue Lynx, or plain
background-thread code.

## What is verified, and what is not

The facade and the fake run here. `bun run check:android` compiles the Kotlin
against the real Lynx AAR and `src/native-contract.test.ts` pins the method
surfaces against each other. `pod lib lint` compiles the Objective-C against the
real iOS SDK, but it is no longer part of CI — run it by hand on a Mac.

**None of that is a device.** See [`AGENTS.md`](./AGENTS.md) for exactly what
each check does and does not cover.

## License

MIT
