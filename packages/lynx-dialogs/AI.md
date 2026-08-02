# AI.md — @amritk/lynx-dialogs

For an LLM consuming this package. Editing the repo instead? See
[`AGENTS.md`](./AGENTS.md).

## Mental model

A native module on each platform, plus a promise-shaped facade that reaches it.
`UIDatePicker` in a sheet and `UIAlertController` on iOS; `DatePickerDialog`,
`TimePickerDialog` and `AlertDialog` on Android.

Everything is a promise, because `NativeModules` lives in Lynx's background
context and a `@amritk/mini-lynx` tree renders on the main thread. There is no
synchronous read of anything here, and no way to show a dialog during a
component's build.

## Setup: one line you will forget

```ts
// background chunk — without this every call queues forever and nothing says why
import { installNativeBridge } from '@amritk/mini-lynx-native/background'
installNativeBridge()
```

The native side links itself through `lynx.lib.json`. Unlike the other native
packages here, there is **nothing** to add to the host app — no permission, no
`Info.plist` key, no manifest entry.

## The surface, in full

```ts
import {
  areDialogsAvailable,
  dismissActiveDialog,
  presentActionSheet,
  presentDatePicker,
} from '@amritk/lynx-dialogs'

presentDatePicker(options?: DatePickerOptions): Promise<DatePickerResult>
presentActionSheet(options: ActionSheetOptions): Promise<ActionSheetResult>
dismissActiveDialog(): Promise<void>     // closes whatever is up; settles it as 'dismissed'
areDialogsAvailable(): Promise<boolean>  // whether the module is linked at all

type DatePickerOptions = {
  mode?: 'date' | 'time' | 'datetime'    // default 'date'
  value?: number                         // epoch ms, default now
  minimum?: number                       // epoch ms; date + datetime only
  maximum?: number                       // epoch ms; date + datetime only
  minuteInterval?: number                // iOS only
  title?: string
  confirmLabel?: string
  cancelLabel?: string
  use24HourClock?: boolean               // default: follow the device
}

type ActionSheetOptions = {
  title?: string
  message?: string
  actions: readonly { label: string; destructive?: boolean; disabled?: boolean }[]
  cancelLabel?: string
  anchor?: { x: number; y: number; width?: number; height?: number }  // iPad only
}

type DatePickerResult =
  | { ok: true; value: number }
  | { ok: false; reason: 'dismissed' | 'busy' | 'unavailable'; message: string }

type ActionSheetResult =
  | { ok: true; index: number }
  | { ok: false; reason: 'dismissed' | 'busy' | 'unavailable'; message: string }
```

## The things most likely to trip you up

1. **Nothing rejects.** Cancelling is `{ ok: false, reason: 'dismissed' }`, not a
   throw. Always branch on `ok` before reading `value` or `index` — TypeScript
   will make you, and code that casts around it will read `undefined` on the
   most common path a user takes.

2. **`value` is epoch milliseconds, not a `Date`.** Everything crossing the
   bridge is plain JSON; a `Date` arrives as `{}`. Use `new Date(result.value)`
   on the way out and `date.getTime()` on the way in.

3. **`index` counts disabled rows.** It is a position in the `actions` array you
   passed. Do not filter the array before passing it and then index into the
   filtered one.

4. **One dialog at a time.** A second presentation while one is up resolves
   `{ ok: false, reason: 'busy' }` — it does not queue, and it does not close the
   first. Guard your double taps or ignore the result.

5. **`mode: 'datetime'` is two dialogs on Android.** Cancelling either cancels
   the whole thing. If the two-step reads badly, ask for a date and a time from
   two places in your own screen instead.

6. **Bounds do nothing in `time` mode.** Neither platform can enforce them on a
   bare time picker. Validate the returned time yourself.

7. **iPad needs an `anchor`.** With none, the popover is centred and arrowless
   rather than crashing — but a sheet growing out of the control the user
   touched is the point of passing one.

8. **Dismiss on navigation.** The dialog outlives the component that opened it:
   `onCleanup(() => void dismissActiveDialog())`.

## What the result carries for each mode

The picker modifies the `value` you gave it rather than building a fresh
instant, on both platforms:

- `date` — the day the user chose, keeping `value`'s time of day untouched.
- `time` — the time the user chose on `value`'s calendar day, with seconds and
  milliseconds **zeroed** (the user chose to the minute).
- `datetime` — both, seconds zeroed.

So `presentDatePicker({ mode: 'date' })` with no `value` returns today-ish with
the current time of day on it. Pass a `value` at midnight if you want a clean
day boundary.

## Testing

```ts
import { MODULE } from '@amritk/lynx-dialogs'
import { createFakeDialogs } from '@amritk/lynx-dialogs/testing'

const dialogs = createFakeDialogs()
installNativeBridge({ peer, emitter, modules: { [MODULE]: dialogs.module } })

const pending = presentActionSheet({ actions: [{ label: 'Delete', destructive: true }] })
dialogs.chooseAction(0)          // or dialogs.cancel()
```

`presented()` shows what is on screen; `setPresentable(false)` models a device
with nowhere to present. The fake **throws** if a test tries to choose a disabled
row or confirm a date outside the picker's bounds — a device would never have
offered either, so a test that could drive them would be pinning behaviour the
app can never reach.

## Do not reach for signals

The surface is promises on purpose — a second edge onto the signal engine gives
a consumer two reactive graphs that cannot see each other's writes. Wire it in
yourself:

```ts
const chosen = signal<number | null>(null)
const pick = async () => {
  const result = await presentDatePicker({ mode: 'date' })
  if (result.ok) chosen(result.value)
}
```
