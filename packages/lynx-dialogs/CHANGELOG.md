# @amritk/lynx-dialogs

## 0.2.1

### Patch Changes

- Updated dependencies [40cbdb5]
  - @amritk/mini-lynx-native@0.2.1

## 0.2.0

### Minor Changes

- 2b07688: Add `@amritk/lynx-dialogs` — the platform's own date picker, action sheet and
  alert for Lynx.

  Lynx ships no picker element and no modal module, and neither published option
  fills the gap: `@lynx-js/lynx-ui-sheet` draws a sheet out of ReactLynx elements
  rather than presenting a native one, and `@sigx/lynx-datetime-picker` is a real
  `UIDatePicker`/`DatePickerDialog` bolted to another framework's bridge. Nothing
  native exists for action sheets at all.

  So this is an Android module, an iOS module, and a promise-shaped facade over
  `@amritk/mini-lynx-native`:

  ```ts
  const date = await presentDatePicker({ mode: "date", maximum: Date.now() });
  if (date.ok) setDeparture(new Date(date.value));

  const choice = await presentActionSheet({
    actions: [{ label: "Replace" }, { label: "Delete", destructive: true }],
  });
  if (choice.ok) apply(choice.index);

  const confirm = await presentAlert({
    title: "Delete this photo?",
    buttons: [
      { label: "Cancel", style: "cancel" },
      { label: "Delete", style: "destructive" },
    ],
  });
  if (confirm.ok && confirm.index === 1) remove();
  ```

  `presentDatePicker` covers `date`, `time` and `datetime` with bounds, labels and
  a 12/24-hour override; `presentActionSheet` covers destructive and disabled rows
  and the iPad popover anchor; `presentAlert` covers one to three buttons with
  cancel and destructive styling. `dismissActiveDialog` closes whatever is up so a
  screen can clean up on navigation, and `areDialogsAvailable` reports whether the
  host app linked the module.

  `AlertButtons` is a one-to-three tuple rather than an array, because
  `AlertDialog` has exactly three button slots and there is no fourth — so the
  Android cap is a compile error instead of a button that goes missing on half the
  devices an app runs on.

  Every outcome is a discriminated union rather than a rejection — cancelling is
  the most likely thing a user does with a dialog, so it is a branch. Only one
  presentation is allowed on screen at a time; a second resolves
  `{ ok: false, reason: 'busy' }` rather than stacking on Android or hanging
  forever on iOS.

  Unlike the other two native packages there is no permission, no `Info.plist` key
  and no manifest entry for the host app to add, and the Android half takes no
  dependencies at all — the framework `AlertDialog` rather than Material, so no
  `Theme.Material3` requirement lands on the host's Activity.

  `@amritk/lynx-dialogs/testing` ships the native contract as an executable fake.

### Patch Changes

- 1b6c33d: Bring every package's shipped `AI.md` back in line with what that package
  actually publishes, and add `bun run check:ai-docs` so it cannot drift again.

  The files had gone stale in the way generated-and-committed docs always do —
  silently, and only for the audience that cannot file an issue about it.
  `@amritk/mini` never documented `watch`, `template`, the typed `matchRoute` /
  `buildPath` re-exports on `/router`, `Field` on `/forms`, or the `/vite` subpath
  at all; `@amritk/mini-lynx` was missing `computed` / `effectScope`,
  `fadeTransition`, `keepAboveKeyboard` and `HANDLER_PREFIX`;
  `@amritk/lynx-notifications` documented neither its `/testing` subpath nor the
  fake behind it. All four native packages exported `MODULE` and `EVENTS` with no
  mention of what they are for, and only `@amritk/lynx-dialogs` showed how to wire
  a fake into `installNativeBridge` — which is the one thing a consumer testing
  its own screens needs.

  Two accuracy fixes matter more than the additions. Every native package's
  _Status_ section claimed the Objective-C compiles against the real Lynx pod; the
  macOS CI job was disabled on cost, so it now compiles only when somebody runs
  `pod lib lint` by hand, and the docs say that. And `@amritk/lynx-dialogs` never
  carried a _Status_ section at all, so nothing in it told a reader that none of
  it has run on a device.

  `bun run check:ai-docs` reads each package's `exports` and fails on a runtime
  export, a published subpath, or (for a package shipping native sources) a
  _Status_ section its `AI.md` never mentions. It runs early in CI, before the
  build. Exports no consumer ever writes — the tree operations the JSX transform
  calls, and the like — are listed in `INTERNAL_EXPORTS` with the reason.

- Updated dependencies [e025ac7]
- Updated dependencies [5101aa7]
  - @amritk/mini-lynx-native@0.2.0
