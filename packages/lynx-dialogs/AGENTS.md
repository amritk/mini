# AGENTS.md — @amritk/lynx-dialogs

Contributor guide for AI agents editing **this package**. Repo-wide rules:
[`../../AGENTS.md`](../../AGENTS.md) and [`../../CLAUDE.md`](../../CLAUDE.md).
Consuming the package instead? See [`AI.md`](./AI.md).

Native date pickers, action sheets and alerts for Lynx: two native modules, and
a promise-shaped facade over `@amritk/mini-lynx-native`.

It is the third native module in this repository and it deliberately mirrors the
first two. When you change something structural here, check
[`../lynx-location`](../lynx-location) and
[`../lynx-notifications`](../lynx-notifications) for the same shape — and the
other way round.

## Commands

```bash
bun run --filter='@amritk/lynx-dialogs' test
bun run --filter='@amritk/lynx-dialogs' types:check
bun run --filter='@amritk/lynx-dialogs' build

# Compiles the Kotlin against the real Lynx AAR and packages an AAR.
# Runs for every package with an Android half, this one included.
# Needs ANDROID_HOME with platforms/android-35; skips with a message without one.
bun run check:android
```

The iOS half is compiled by `pod lib lint` on a macOS CI runner — there is no
way to build it on Linux at all. See "What is verified, and what is not" below,
which is the most important thing on this page.

## Layout

```
src/
  index.ts                  The `.` entry — every function, re-exported
  types.ts                  The shapes that cross to native. One file, so Kotlin
                            and Objective-C have a single thing to agree with
  native-module.ts          MODULE — the only string that crosses
  present-date-picker.ts / present-action-sheet.ts / present-alert.ts
  dismiss-active-dialog.ts / are-dialogs-available.ts
  native-contract.test.ts   Parses both native surfaces, compares to this one
  dialogs.test.ts           The facade over the real bridge, against the fake
  testing/
    create-fake-dialogs.ts  The native contract, executable
android-check/              A standalone Gradle project that COMPILES ../android
android/
  build.gradle.kts, src/main/AndroidManifest.xml   (the manifest is empty, on purpose)
  src/main/java/dev/amritk/minilynx/dialogs/
    MiniLynxDialogsModule.kt   The @LynxMethod surface, and the thread hop
    ActiveDialog.kt            The one presentation slot, process-wide
    DialogSession.kt           One presentation: its dialog, and its single answer
    DialogHost.kt              Finding an Activity to present from
    DatePickers.kt             DatePickerDialog, TimePickerDialog, and the two-step
    ActionSheets.kt            AlertDialog + list, and the custom header
    ActionSheetAdapter.kt      Destructive and disabled rows, which setItems cannot do
    Alerts.kt                  AlertDialog + buttons, and the three-slot mapping
    DialogResults.kt           Every string that crosses
    Options.kt                 Reading a ReadableMap without trusting it
ios/
  MiniLynxDialogs.podspec
  src/MiniLynxDialogsModule.{h,m}         The methodLookup surface
  src/MiniLynxDialogsPresenter.{h,m}      The slot, the window search, the fan-in
  src/MiniLynxDatePickerController.{h,m}  A sheet around a UIDatePicker
lynx.lib.json               The autolink manifest
```

## Invariants — do not break these

- **`src/testing/create-fake-dialogs.ts` IS the native contract.** Method names,
  arities and call forms are agreed in three places — the fake, the Kotlin and
  the Objective-C — and only the fake is executable here. Changing a method means
  changing all three in the same commit, and the fake is the one that will tell
  you if you got the TypeScript side wrong. Never "fix" a test by loosening the
  fake toward what the facade happens to do.
- **The fake reproduces platform behaviour rather than smoothing it.** A second
  presentation is refused; a disabled row cannot be chosen; a value outside the
  picker's bounds cannot be confirmed. The last two **throw**, which is the one
  place the fake steps out of character deliberately — reaching them means the
  *test* is wrong, and a device would never have offered either.
- **A cancellation is a value, never a rejection.** Lynx has no error convention
  for bridge callbacks, so every outcome travels as a `{ ok }` union. Making
  cancellation throw would put a `try`/`catch` around the single most likely
  thing a user does with a dialog.
- **Exactly one answer reaches each caller.** A dialog has several routes to an
  answer that all fire for one interaction: a button handler dismisses the
  dialog, so the click listener and the dismiss listener both run; the back
  gesture fires cancel *and* dismiss; `dismissActiveDialog` closes a dialog whose
  own listeners then run anyway. Every route funnels through `DialogSession.finish`
  / `-[MiniLynxDialogsPresenter finish:]`, guarded by an atomic flag. Invoking a
  Lynx `Callback` twice is not recoverable on the other side. Any new answer path
  owes the same treatment.
- **The slot is released before the callback runs.** A caller may present again
  the instant its promise settles — a sheet whose choice opens a picker is the
  ordinary case — and a slot still holding the finished presentation would refuse
  that one as `busy`. `dialogs.test.ts` pins the back-to-back case.
- **The slot is claimed on the calling thread, not the UI thread.** That is what
  makes `busy` deterministic. Move the claim inside the UI-thread post and two
  presentations race, with the loser's outcome depending on scheduling.
- **One presentation slot per *process*, not per module instance.** A module is
  created per LynxView and two LynxViews share a window, so a per-view slot would
  let each put a sheet up and hand the user both — and nothing guarantees the
  instance serving `dismissActiveDialog` is the one that presented.
- **`index` is a position in the caller's `actions` array, disabled rows
  included.** Both native halves add every row and disable rather than skip. A
  sheet that compacted its list would silently apply the wrong action, and only
  in the states where a row happened to be disabled.
- **`AlertDialog` will not show a message and a list at the same time.** This is
  why `ActionSheets.kt` builds a `setCustomTitle` view instead of calling
  `setMessage`. `AlertController.setupContent` only moves the `ListView` into the
  content panel when there is no message to put there — set both and the message
  appears, the rows do not, and nothing says why. Do not "simplify" it back.
- **An alert has one to three buttons, and `AlertButtons` is a tuple because of
  it.** `AlertDialog` has exactly three button slots — positive, negative,
  neutral — and there is no fourth. Making that an array with a runtime check
  would move a compile error onto a device, and only onto the Android half of
  it. iOS caps at three too, deliberately: an alert that reads differently on the
  two platforms is worse than one that never offered the fourth choice.
- **`Alerts.SLOTS` maps array order onto reading order, not onto slot numbers.**
  Android lays buttons out negative, neutral, positive regardless of the order
  they were added, so a two-button alert has to use negative and positive to put
  `buttons[0]` on the left. A press reports the *slot*, which is why
  `indexBySlot` exists — answering with the slot number would hand JavaScript
  -1, -2 or -3 where it expected an index.
- **Destructive alert buttons are tinted after `show()`.** `getButton` returns
  null until the dialog has built its view, so tinting any earlier silently does
  nothing and looks like the colour was simply ignored.
- **At most one iOS alert action may be `UIAlertActionStyleCancel`.**
  `UIAlertController` raises on the second, which is a crash reachable straight
  from an options bag. `presentAlert:callback:` keeps a `cancelTaken` flag and
  demotes any extra to the default style. Do not remove it in the belief that
  the JavaScript side validates this — it does not.
- **An alert with no buttons is refused on both platforms.** On Android it would
  merely be odd; on iOS an alert has no dismissal gesture at all, so one with no
  buttons is a modal the user can never leave and an app that is finished. The
  tuple type makes it unreachable from typed code and both halves check anyway,
  because the cost of being wrong is the whole session.
- **The Android alert stays cancelable, and that asymmetry is deliberate.** The
  back gesture dismissing a dialog is something Android users expect everywhere
  else in the system. `AlertResult` documents that `dismissed` is a real outcome
  there and effectively never one on iOS.
- **No `androidx.appcompat` and no Material.** A bottom sheet would mean
  `com.google.android.material` and a required `Theme.Material3` on the host's
  Activity. The framework `AlertDialog` is themed by whatever the host already
  uses. Same restraint `@amritk/lynx-location` shows in refusing Play Services,
  and this package currently has **no** implementation dependencies at all.
- **A `Dialog` needs an Activity, and it says so only at show time.** Built on an
  application context it throws `BadTokenException` when shown, not when
  constructed, so the mistake survives every check that looks like it caught it.
  `DialogHost` unwraps the `LynxContext` first and falls back to the last resumed
  Activity, and re-checks `isFinishing`/`isDestroyed` at the moment of use because
  a presentation happens one thread hop after it was asked for.
- **`Application.ActivityLifecycleCallbacks` needs all seven methods.** The
  `Pre`/`Post` variants got defaults in API 29; these seven have been abstract
  since API 14. This is the same lesson `LocationListener` teaches in
  `@amritk/lynx-location`.
- **An iPad action sheet without a popover source rect raises.** A real,
  reproducible crash that cannot happen on a phone and therefore never happens in
  testing. `-configurePopover:from:anchor:` always sets `sourceView`, and centres
  with no permitted arrow direction when the caller passed no anchor. Never make
  that call conditional on the anchor being present.
- **UIKit performs dismissals it does not report.** A swipe down on the date
  sheet and a tap outside an iPad popover both close the dialog and run no
  handler — the promise would never settle, which looks to the app exactly like a
  dialog that is still open. `-present:from:` wires the presenter in as the
  delegate for both. It sets `presentationController.delegate` only for the date
  sheet: a `UIAlertController` manages its own presentation controller, so only
  its `popoverPresentationController.delegate` is safe to take.
- **`minuteInterval` is guarded because UIKit raises on a value that does not
  divide 60.** An options bag arriving from JavaScript must not be able to take
  the app down.
- **Seconds are zeroed in `time` and `datetime`, and left alone in `date`.** The
  user chose to the minute, and Android's `TimePickerDialog` cannot offer more,
  so this is what makes the two platforms answer the same value for the same
  interaction. `date` mode leaves the time of day untouched because the user did
  not touch it — which is also what `UIDatePicker` does natively, and what
  carrying one `Calendar` through both Android steps does.
- **`datetime`'s first Android dialog must not settle the promise.** `DatePickers`
  keeps an `advanced` flag for exactly this: the date dialog's dismiss listener
  fires when it hands over to the time dialog, and without the flag that reads as
  a cancellation and answers before the user has finished.
- **No signals, and no `alien-signals` dependency.** A second edge onto the signal
  engine is how a consumer ends up with two reactive graphs that cannot see each
  other's writes. `scripts/consumer-e2e.test.ts` asserts the absent dependency.

## Why this package has no events

`@amritk/lynx-notifications` and `@amritk/lynx-location` both publish through
`GlobalEventEmitter`, because a notification arrives when the system decides and
a watch produces a stream. A dialog does neither: the app asks, the user answers
once, and it is over.

So every method here is the plain request/response shape `callNativeAsync` was
built for, and the package has no `Events` file, no context fan-out, and no
cold-start buffer to keep in step across two languages. If you find yourself
adding one, check first whether what you are modelling is really a dialog.

## What is verified, and what is not

Four things state this package's contract — the facade, the fake, the Kotlin and
the Objective-C — and they are checked at three different strengths. Know which
one you are relying on before trusting a green run.

| Check | Command | Strength |
| --- | --- | --- |
| Facade behaviour | `bun run test` | real code, fake platform |
| Cross-language signatures | `src/native-contract.test.ts` | parses Kotlin + Objective-C, compares to TypeScript |
| Kotlin compiles + packages | `bun run check:android` | real `org.lynxsdk.lynx:lynx` AAR, real Android SDK |
| Objective-C compiles | `pod lib lint` (CI, macOS) | real Lynx pod, real iOS SDK |

`native-contract.test.ts` is the cheapest of these and catches the failure a
compiler cannot on either side: a method renamed in one language, an argument
added in one, a reason code only one platform can report, a result key spelled
differently. It also checks something `pod lib lint` cannot — that every selector
in `methodLookup` names a method that exists, which on iOS is not a build error
but a dispatch failure on a device. **Mutation-check it if you change it** — a
parity test that cannot fail is worse than none, because it looks like coverage.

`check:android` is deliberately outside `bun run test`: it needs an SDK, pulls
from the network and takes minutes cold, and a check with those properties in the
default loop is one people learn to skip. It skips with an explanation locally and
is `--require-sdk` in CI.

**None of that is a device.** Still unverified, and worth checking on hardware
first:

- that `@LynxNativeModule` on a class extending `LynxContextModule` actually
  registers — it compiles, but whether Lynx's processor picks it up without the
  generated Spec its own template extends is untested;
- that a `ReadableMap` carrying an array of maps survives `Options.read` as the
  nested `List<Map<String, Any?>>` `Options.maps` expects — `ReadableType.Map` and
  `ReadableType.Array` are read the way `@amritk/lynx-notifications`' `Json.kt`
  reads them, which compiles, and no test here drives real bridge values through
  it;
- that `Callback.invoke(JavaOnlyMap)` arrives as a single object argument on the
  JavaScript side, which every result here assumes;
- that `AlertDialog.getButton` returns a tinted button for every slot on a real
  OEM theme, and that the three-slot layout puts the buttons where `Alerts` says
  it does;
- everything about how the dialogs actually look and behave: whether the custom
  header lines up with the rows on an OEM theme, whether the wheels sit correctly
  in a medium detent below iOS 15, whether the two-step `datetime` reads as one
  interaction or two, what an iPad popover does with and without an anchor, and
  whether a rotation or a backgrounding mid-presentation leaves the slot claimed.

That last one is the risk this package carries that the other two do not: its
whole surface is UI, and UI is the part a signature test proves least about.

Carry the caveat the way `@amritk/lynx-location` carries its own: state it, do
not let a green suite imply more than it proves, and narrow it only when
something has actually checked.

## Adding a fourth dialog

The three here share everything that is hard: the slot, the session, the thread
hop, the Activity and key-window search, and the one-answer guarantee. A new one
is a `present*` method on the module plus a file that builds the platform dialog
and calls `session.finish` — `Alerts.kt` and `presentAlert:callback:` are the
smallest example of the shape.

What is not optional is doing it in **one commit across four places**: the fake,
the facade, the Kotlin and the Objective-C, including `methodLookup`. The parity
suite will catch a method missing from one of them, and it cannot catch one that
is present everywhere and means something different in each.

Add a changeset for every change (`bunx changeset`).
