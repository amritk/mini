---
'@amritk/lynx-dialogs': minor
---

Add `@amritk/lynx-dialogs` — the platform's own date picker and action sheet for
Lynx.

Lynx ships no picker element and no modal module, and neither published option
fills the gap: `@lynx-js/lynx-ui-sheet` draws a sheet out of ReactLynx elements
rather than presenting a native one, and `@sigx/lynx-datetime-picker` is a real
`UIDatePicker`/`DatePickerDialog` bolted to another framework's bridge. Nothing
native exists for action sheets at all.

So this is an Android module, an iOS module, and a promise-shaped facade over
`@amritk/mini-lynx-native`:

```ts
const date = await presentDatePicker({ mode: 'date', maximum: Date.now() })
if (date.ok) setDeparture(new Date(date.value))

const choice = await presentActionSheet({
  actions: [{ label: 'Replace' }, { label: 'Delete', destructive: true }],
})
if (choice.ok) apply(choice.index)
```

`presentDatePicker` covers `date`, `time` and `datetime` with bounds, labels and
a 12/24-hour override; `presentActionSheet` covers destructive and disabled rows
and the iPad popover anchor. `dismissActiveDialog` closes whatever is up so a
screen can clean up on navigation, and `areDialogsAvailable` reports whether the
host app linked the module.

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
