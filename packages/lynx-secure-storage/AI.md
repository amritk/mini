# AI.md — @amritk/lynx-secure-storage

For an LLM consuming this package. Editing the repo instead? See
[`AGENTS.md`](./AGENTS.md).

## Mental model

A native module on each platform, plus a promise-shaped facade that reaches it.
The iOS Keychain (`kSecClassGenericPassword`) and Android's
`EncryptedSharedPreferences` over a Keystore-backed master key.

It is a **string-to-string map that survives a restart and is encrypted at
rest**. It is not a database, not a cache, and not somewhere to put a list.
Serialising is the caller's job.

Everything is a promise, because `NativeModules` lives in Lynx's background
context and a `@amritk/mini-lynx` tree renders on the main thread. There is no
synchronous read of anything here.

## Setup: one line you will forget

```ts
// background chunk — without this every call queues forever and nothing says why
import { installNativeBridge } from '@amritk/mini-lynx-native/background'
installNativeBridge()
```

The native side links itself through `lynx.lib.json`. There is no permission and
no `Info.plist` key. On Android the library contributes its own backup
exclusion, which can *fail the host app's build* if the app declares backup
rules of its own — that is deliberate, and the README has the four-line fix.

## The surface, in full

```ts
import {
  clearSecureStorage,
  getSecureItem,
  hasSecureItem,
  isSecureStorageAvailable,
  MAX_VALUE_BYTES,
  MODULE,
  removeSecureItem,
  setSecureItem,
} from '@amritk/lynx-secure-storage'

getSecureItem(key: string): Promise<string | null>                  // null = absent; throws if unreadable
setSecureItem(key: string, value: string, options?: SecureItemOptions): Promise<SecureWriteResult>
removeSecureItem(key: string): Promise<void>                        // removing an absent key is fine
hasSecureItem(key: string): Promise<boolean>                        // never brings the value across
clearSecureStorage(): Promise<void>                                 // this package's items only
isSecureStorageAvailable(): Promise<boolean>                        // never throws

type SecureItemOptions = { accessibility?: SecureAccessibility }
type SecureAccessibility = 'whenUnlocked' | 'afterFirstUnlock'      // iOS only; default afterFirstUnlock

type SecureWriteError = 'unavailable' | 'keystoreFailure' | 'tooLarge'
type SecureWriteResult =
  | { ok: true }
  | { ok: false; error: SecureWriteError; message: string }

MAX_VALUE_BYTES   // 8192 — a larger value answers `tooLarge`, it is not truncated
MODULE            // 'MiniLynxSecureStorageModule', for registering the fake
```

## The one rule that is not like the sibling packages

`setSecureItem` reports failure as a **value**. The other four **throw** when
the store cannot be reached.

That is not an inconsistency, it is the point. `getSecureItem` answers
`string | null`, so `null` has to keep meaning exactly one thing — *there is no
such key*. A store that could not be opened, reported as an empty one, signs the
user out of an app whose credential is on the disk, intact.

```ts
try {
  const token = await getSecureItem('session')
  if (token === null) showSignIn()   // genuinely signed out
  else resume(token)
} catch {
  showRetry()                        // unknown — do NOT treat this as signed out
}
```

Use `isSecureStorageAvailable()` when a branch reads better than a `catch`.

## The things most likely to trip you up

1. **Do not `catch` a read and fall back to `null`.** It is the one mistake this
   API is shaped to prevent, and it produces a mysterious sign-out on a locked
   device.

2. **Values are strings.** `JSON.stringify` going in, `JSON.parse` coming out.
   Passing an object gets you `"[object Object]"` at best.

3. **`accessibility` is iOS only.** Android's Keystore key is usable whenever
   the app's process runs. Do not build a security argument on it holding on
   both platforms.

4. **`whenUnlocked` breaks background reads.** An item written with it is
   unreadable while the screen is locked — that arrives as a *throw*, not as
   `null`. A session token wants the `afterFirstUnlock` default.

5. **Keychain items survive an uninstall on iOS**, and this package clears them
   on first run for you (a flag in `NSUserDefaults`, which uninstall *does*
   clear). Do not add your own wipe-on-launch on top; you would be clearing a
   store that is already fresh.

6. **An Android restore loses everything in here.** The Keystore key never
   leaves the device, so a restored file is undecryptable and the library
   discards it. Treat "the user restored a backup" as "the user is signed out",
   and never as data corruption to report.

7. **8 KiB cap.** `MAX_VALUE_BYTES`, counted in UTF-8 bytes, and a larger value
   answers `{ ok: false, error: 'tooLarge' }`. If you are near it, you are
   storing the wrong thing here.

8. **`clearSecureStorage` is scoped to this package**, on both platforms. It
   will not clear a host app's own Keychain items, and it cannot be talked into
   it.

9. **No biometrics in 0.1.** No `LAContext`, no
   `setUserAuthenticationRequired`. Do not tell a user an item is behind Face ID.

10. **Nothing is logged, ever.** If you add code here, keep it that way — the
    parity suite fails the build on a logging call in either native half.

## Testing

```ts
import { MODULE } from '@amritk/lynx-secure-storage'
import { createFakeSecureStorage } from '@amritk/lynx-secure-storage/testing'

const storage = createFakeSecureStorage()
installNativeBridge({ peer, emitter, modules: { [MODULE]: storage.module } })

await setSecureItem('session', 'token')
storage.reinstall()                       // keychain survives, NSUserDefaults does not
expect(await getSecureItem('session')).toBeNull()
```

`createFakeSecureStorage()` returns `{ module, stored, setAvailable,
setDeviceLocked, corruptKeyset, breakKeystore, restartProcess, reinstall }`.
`stored()` is the whole store as a record of `FakeSecureItem`
(`{ value, accessibility }`); the rest stage the states a device will not produce
on request:

- `setAvailable(false)` — no store at all: every call answers `unavailable`.
- `setDeviceLocked(true)` — `whenUnlocked` items become unreadable;
  `afterFirstUnlock` items do not.
- `corruptKeyset()` — the next call **recovers** by discarding everything, so
  reads answer `null` rather than failing.
- `breakKeystore(true)` — does **not** recover: reads throw `keystoreFailure`.
- `restartProcess()` vs `reinstall()` — values survive the first and not the
  second, and the mechanism is the point.

The types are exported too: `FakeSecureStorage` and `FakeSecureItem`.

## Do not reach for signals

The surface is promises on purpose — a second edge onto the signal engine gives
a consumer two reactive graphs that cannot see each other's writes. Wire it in
yourself:

```ts
const session = signal<string | null>(null)
getSecureItem('session')
  .then(session)
  .catch(() => undefined)   // unknown, not signed out — decide in one place
```

## Status

Pre-alpha. The Kotlin compiles in CI against the real Lynx AAR, and a parity
suite pins both native method surfaces, the error codes, the Keychain protection
classes, the Android backup exclusion and the no-logging rule against the
TypeScript. The Objective-C compiles only when somebody runs `pod lib lint` on a
Mac by hand — the macOS CI job was disabled on cost — and **none of it has run
on a device.**

Specifically unproven: that a Keychain item really survives an uninstall and
that the first-run flag really catches it, that the Android recovery fires on a
genuinely restored backup rather than on the simulated one, that a
`whenUnlocked` item is unreadable on a locked screen, and that the backup
exclusion actually keeps the file out of a real backup. Do not present any of it
as proven.
