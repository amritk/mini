# @amritk/mini-lynx-native

## 0.2.1

### Patch Changes

- 40cbdb5: Republish the bridge with the `dist/` its manifest has always promised, and
  remove the `development` export condition that hid the miss.

  `@amritk/mini-lynx-native@0.2.0` went to npm as a src-only tarball. It was
  published by hand rather than through the release workflow, so none of the
  things that workflow does before `changeset publish` ever ran: no `bun run
build`, so there was no `dist/`; no `strip-development-exports`, so the
  `development` condition survived; no `copy-license`, so the tarball carried no
  LICENSE. The manifest still declared `./dist/index.js`, `./dist/background/index.js`
  and `./dist/testing/index.js`, and `files` still listed `dist` — every one of
  those pointed at nothing.

  The surviving condition is why this was survivable rather than fatal, and why it
  went unnoticed for a release: it resolved to `./src/*.ts`, and `src` does ship,
  so anything honouring it got raw TypeScript and appeared to work. Anything that
  did not — plain Node, a bundler on default conditions, `tsc` reading `types` —
  got a resolution failure against a package whose exports named files that were
  not in the tarball.

  0.2.1 is the same code, published through the release workflow, so it carries
  `dist/` and its type declarations. Consumers working around the miss by forcing
  the `development` condition — a `customConditions` entry in `tsconfig.json`, a
  resolve condition in the bundler config, a `--conditions development` flag on
  the test command — can drop all three and resolve normally.

  The four `@amritk/lynx-*` packages pin the bridge at an exact version, so their
  0.2.0 releases still point at the broken tarball; they go out alongside this one
  re-pinned to 0.2.1.

  **The condition is gone from every package.** It existed so the workspace could
  resolve its own packages to source without a build, but it lived in the one
  place that ships — the `exports` map — which is what let it reach a tarball at
  all. Nothing strips it at publish time now because nothing declares it: the
  packages resolve each other through `types`/`import` like any consumer, and the
  build simply runs before the type check. Tests are unaffected, having always
  used `vitest.config.ts`'s `src` aliases rather than the condition. The
  playgrounds and the bundle-size bench keep resolving to source through
  repo-local mechanisms that cannot ship.

  Publishing out of band can no longer do this quietly. Every publishable package
  runs `scripts/check-publishable.mjs` as `prepublishOnly`, which fails the
  publish when an exports map points at a `dist/` file that is not on disk, when a
  `development` condition is present at all, or when the package directory has no
  LICENSE.

## 0.2.0

### Minor Changes

- e025ac7: Add native modules for Lynx, starting with push notifications.

  Lynx ships no notifications module, and Sparkling's `sparkling-notifications` is
  a reserved npm name with no implementation behind it — so the official answer is
  still "write native code and send it into your Lynx code". These two packages
  are that, plus the piece it needs first.

  **`@amritk/mini-lynx-native`** is the wire. Lynx's `NativeModules` and
  `GlobalEventEmitter` are background-thread globals, while `@amritk/mini-lynx`
  renders on the main thread because the Element PAPI is a main-thread API — so a
  component reaching for a native module finds `undefined`, with nothing to read.
  The package carries calls one way and events the other: `callNative` and
  `callNativeAsync` for the two shapes a Lynx native method comes in,
  `isNativeModuleAvailable` for feature detection, and `onNativeEvent` for
  `sendGlobalEvent`. Calls made before the background half is installed are queued
  rather than lost, because the main-thread chunk usually runs first. The
  `/background` subpath is the half an app installs in its background chunk, in
  one line; `/testing` ships the fakes both halves run against.

  **`@amritk/lynx-notifications`** is the first module built on it: local and
  remote push, with an Android implementation (`NotificationManager`,
  `AlarmManager`, FCM) and an iOS one (`UNUserNotificationCenter`, APNs) declared
  to Lynx's autolinker through `lynx.lib.json`. The JavaScript surface is promises
  and subscriptions rather than signals, deliberately — a second edge onto the
  signal engine is how a consumer ends up with two reactive graphs that cannot see
  each other's writes.

  Both native halves are compiled in CI — Gradle against the real
  `org.lynxsdk.lynx:lynx` AAR for Android, `pod lib lint` against the real Lynx pod
  on a macOS runner for iOS — and `src/native-contract.test.ts` pins their method
  names, arities and event strings against the TypeScript, which is the one class
  of drift no compiler on either side can catch. `bun run check:android` runs the
  Android compile locally and skips with an explanation when there is no SDK.

  **None of that has run on a device.** Permission flows, `AlarmManager` under
  Doze, APNs registration and FCM delivery are unverified. The caveat is carried in
  the package's `README.md`, `AI.md` and `AGENTS.md`.

### Patch Changes

- 5101aa7: Correct the two mis-call failure modes in `AI.md`, and pin them with tests.

  The gotchas list had them the wrong way round: it said `callNative` on a
  callback method never settles and `callNativeAsync` on a returning one gives
  you `undefined`. The bridge does the opposite, and it is not a close call —
  the `return` form always replies, so `callNative` always settles, while the
  `callback` form appends a callback that a returning method ignores, so nothing
  ever replies at all.

  ```ts
  // settles: with `undefined` for a method that stores the callback, or as a
  // rejection when the method reaches for the argument it was not handed
  await callNative("StorageModule", "loadValue", "profile");

  // never settles: the appended callback is an argument the method ignores
  await callNativeAsync("StorageModule", "getValue", "token");
  ```

  Both are now cases in `channel.test.ts`, because the symmetric-sounding summary
  is the half that sends people looking in the wrong place — a promise that never
  settles reads as a thread problem, and it is a one-word choice at the call site.

  Found by wiring the package into `apps/playground-mini-lynx`, which now has a
  screen per native package driving them through each package's own published
  fake.
