---
'@amritk/mini-lynx-native': patch
---

Correct the two mis-call failure modes in `AI.md`, and pin them with tests.

The gotchas list had them the wrong way round: it said `callNative` on a
callback method never settles and `callNativeAsync` on a returning one gives
you `undefined`. The bridge does the opposite, and it is not a close call —
the `return` form always replies, so `callNative` always settles, while the
`callback` form appends a callback that a returning method ignores, so nothing
ever replies at all.

```ts
// settles: with `undefined` for a method that stores the callback, or as a
// rejection when the method reaches for the argument it was not handed
await callNative('StorageModule', 'loadValue', 'profile')

// never settles: the appended callback is an argument the method ignores
await callNativeAsync('StorageModule', 'getValue', 'token')
```

Both are now cases in `channel.test.ts`, because the symmetric-sounding summary
is the half that sends people looking in the wrong place — a promise that never
settles reads as a thread problem, and it is a one-word choice at the call site.

Found by wiring the package into `apps/playground-mini-lynx`, which now has a
screen per native package driving them through each package's own published
fake.
