# @amritk/lynx-secure-storage

**Encrypted key-value storage for Lynx.** The iOS Keychain, Android's
`EncryptedSharedPreferences` over a Keystore-backed master key, and a
promise-shaped facade that reaches them from a main-thread
[`@amritk/mini-lynx`](../mini-lynx) tree.

```ts
import { getSecureItem, removeSecureItem, setSecureItem } from '@amritk/lynx-secure-storage'

const written = await setSecureItem('session', token)
if (!written.ok) console.warn('not persisted', written.error)

const session = await getSecureItem('session')   // the string, or null
await removeSecureItem('session')                // signing out
```

## Why this exists

Lynx ships no storage of any kind. `@lynx-js/types` declares no key-value API on
the `lynx` global — not a secure one, not an insecure one. The one published
option is TikTok's
[`sparkling-storage`](https://www.npmjs.com/package/sparkling-storage), and it
is neither secure nor complete:

- **Android** is plain `SharedPreferences` — unencrypted XML in the app's data
  directory, and swept into Android's auto-backup by default.
- **iOS** ships **no implementation at all**: only a `StorageService` protocol
  resolved out of a DI registry that the host app is expected to fill in.

So there is currently nothing in the Lynx ecosystem you can put a credential in.
That is a problem the moment an app has one — a session token in an engine that
may have no cookie jar has to live *somewhere*, and "somewhere" should not be a
file anyone with the device can read.

## Install

```sh
bun add @amritk/lynx-secure-storage
```

`@amritk/mini-lynx-native` comes with it — it is the wire every call travels.

## JavaScript setup

One line, in your **background** chunk:

```ts
import { installNativeBridge } from '@amritk/mini-lynx-native/background'

installNativeBridge()
```

Without it every call queues forever and nothing says why: `NativeModules` lives
only in Lynx's background context, and a `@amritk/mini-lynx` tree renders on the
main thread.

## Host app setup

The native halves link themselves — `lynx.lib.json` declares the Android and iOS
sources and Lynx's autolinking picks them up. There is **no permission to
request and no `Info.plist` key to add**: neither platform gates a keychain item
or a Keystore key.

There is one thing to know about, on Android, and it is a build error rather
than something you can forget: see below.

## The surface

```ts
getSecureItem(key: string): Promise<string | null>
setSecureItem(key: string, value: string, options?: SecureItemOptions): Promise<SecureWriteResult>
removeSecureItem(key: string): Promise<void>
hasSecureItem(key: string): Promise<boolean>
clearSecureStorage(): Promise<void>
isSecureStorageAvailable(): Promise<boolean>

type SecureItemOptions = {
  /** iOS only. Default 'afterFirstUnlock' — readable by background work after a reboot. */
  accessibility?: 'whenUnlocked' | 'afterFirstUnlock'
}

type SecureWriteResult =
  | { ok: true }
  | { ok: false; error: 'unavailable' | 'keystoreFailure' | 'tooLarge'; message: string }
```

**Strings only, not arbitrary JSON.** The Keychain stores `Data` and
`EncryptedSharedPreferences` stores a `String`; serialising is yours, and it
keeps the contract something you can read off the type.

`MAX_VALUE_BYTES` (8 KiB) is exported too: a value over it answers `tooLarge`
rather than being truncated.

## `null` means absent. A failed read throws.

This is the one thing to take away from this page.

`setSecureItem` reports failure as a value, because an app that has just been
handed a credential has to branch on whether it was persisted. **Everything else
throws when the store cannot be reached**, and that asymmetry is deliberate:
`getSecureItem` returns `string | null`, so if a broken store also answered
`null`, an app would sign a user out because a device happened to be locked —
with the credential sitting on the disk, intact.

```ts
try {
  const token = await getSecureItem('session')
  if (token === null) showSignIn()   // genuinely not there
  else resume(token)
} catch {
  showRetry()                        // unknown, which is not the same thing
}
```

`isSecureStorageAvailable()` never throws, and is the version to use when you
would rather ask than catch.

## What is actually protecting the value

**iOS.** `kSecClassGenericPassword` items under a `kSecAttrService` of the app's
bundle identifier, so a host app's own Keychain items are never in scope.
`afterFirstUnlock` maps to `kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly`
and `whenUnlocked` to `kSecAttrAccessibleWhenUnlockedThisDeviceOnly`. The
`ThisDeviceOnly` suffix is the load-bearing part: without it an item rides out
through iCloud Keychain and encrypted backups. There is no option here that
turns that on.

A write to an existing key uses `SecItemUpdate` rather than a delete followed by
an add. Between a delete and an add there is a window in which the credential
does not exist, and a process killed inside it — which is exactly where the
system kills apps — leaves a user signed out with nothing to explain it.

**Android.** `EncryptedSharedPreferences` (AES256-SIV for keys, AES256-GCM for
values) over a `MasterKey` in the AndroidKeyStore, `minSdk 23` because below
that there is no Keystore-backed AES to build on. The master key never leaves
the device.

## Android backup: the one thing the host has to know

Because the master key never leaves the device, a backed-up copy of the
preferences file is **undecryptable ciphertext** on any other device — which is
*worse* than the file being absent, because it reads as corruption rather than
as a signed-out user. Auto-backup is on by default for every app targeting API
23 and up, so a library that only documented this would be shipping that failure
to most of its hosts.

So this library contributes the exclusion through its own manifest:

```xml
<application
  android:fullBackupContent="@xml/minilynx_secure_storage_backup_rules"
  android:dataExtractionRules="@xml/minilynx_secure_storage_data_extraction_rules" />
```

If your app declares either attribute itself, the manifest merger will **fail
the build** naming both — which is the intended outcome, because which rules win
is your app's decision and a build error is the only way to make it one. Resolve
it in your own manifest:

```xml
<application
  android:fullBackupContent="@xml/app_backup_rules"
  android:dataExtractionRules="@xml/app_data_extraction_rules"
  tools:replace="android:fullBackupContent,android:dataExtractionRules">
```

and copy these two entries into your own rule files:

```xml
<!-- res/xml/app_backup_rules.xml -->
<full-backup-content>
  <exclude domain="sharedpref" path="minilynx_secure_storage.xml" />
</full-backup-content>
```

```xml
<!-- res/xml/app_data_extraction_rules.xml -->
<data-extraction-rules>
  <cloud-backup>
    <exclude domain="sharedpref" path="minilynx_secure_storage.xml" />
  </cloud-backup>
  <device-transfer>
    <exclude domain="sharedpref" path="minilynx_secure_storage.xml" />
  </device-transfer>
</data-extraction-rules>
```

`device-transfer` is the phone-to-phone copy a user does when setting up a new
device. It never touches a cloud, which makes it sound harmless — but the
Keystore key does not travel with it either, so the outcome is the same.

An app with `android:allowBackup="false"` needs none of this.

## The things that will surprise you

**Keychain items survive an uninstall.** Delete an app on iOS, install it again,
and its Keychain items are still there — so a reinstall can find a live session
belonging to an install the user deliberately removed. This package handles it:
the iOS half keeps a first-run flag in `NSUserDefaults`, which *is* cleared on
uninstall, and clears the store when it finds the flag missing. A fresh install
is a fresh store, and you do not have to remember to ask.

**An Android keyset can become unreadable.** After a restore, or on devices that
drop Keystore keys when the lock screen changes, `EncryptedSharedPreferences`
throws — on `create`, which for most apps is on the path to the first screen.
This package discards the file and the key and recreates the pair rather than
propagating that: the data is unrecoverable either way, and the only question
was whether the app opens. Your user is signed out; your app is not in a crash
loop.

**A read before the first unlock fails.** `errSecInteractionNotAllowed`, on iOS,
for anything written as `whenUnlocked`. That is exactly why the default is
`afterFirstUnlock` — background work after a reboot has to be able to read a
session token.

**Nothing is ever logged.** Not the key, not the value, at any level, on either
platform. A failure names its `OSStatus` or its exception class and nothing else,
and the parity suite fails the build if a logging call appears in either native
half.

## Not in 0.1: biometric-gated items

No `LAContext` on iOS and no `setUserAuthenticationRequired` on Android. Putting
Face ID or a fingerprint in front of an item means a prompt, a lifecycle around
it, a cancellation path and its own failure modes on each platform — and half of
that shipped would be worse than none of it, because an app would wire a
credential to a gate that only really works on one platform.

## Testing without a device

`@amritk/lynx-secure-storage/testing` exports the native module's contract as
something a test can drive:

```ts
import { MODULE } from '@amritk/lynx-secure-storage'
import { createFakeSecureStorage } from '@amritk/lynx-secure-storage/testing'

const storage = createFakeSecureStorage()
installNativeBridge({ peer, emitter, modules: { [MODULE]: storage.module } })

await setSecureItem('session', 'token')
storage.reinstall()
expect(await getSecureItem('session')).toBeNull()
```

It reproduces the platforms rather than smoothing them over, and the states it
can stage are the ones a device will not produce on request:
`setAvailable(false)` is a store that does not answer, `setDeviceLocked(true)`
withholds `whenUnlocked` items only, `corruptKeyset()` recovers by discarding
everything, `breakKeystore(true)` does not recover, and `restartProcess()`
differs from `reinstall()` in exactly the one way that matters — a reinstall
clears `NSUserDefaults`, and that is what makes the previous install's session
disappear.

## No signals here

The surface is promises, deliberately. A second edge onto the signal engine is
how a consumer ends up with two reactive graphs that cannot see each other's
writes, and wiring a promise into whichever graph you already have is one line.
It also means this works unchanged from ReactLynx, Vue Lynx, or plain
background-thread code.

## What is verified, and what is not

The facade and the fake run here. `bun run check:android` compiles the Kotlin
against the real Lynx AAR and `src/native-contract.test.ts` pins the method
surfaces, the error codes, the Keychain protection classes, the backup exclusion
and the no-logging rule against each other. `pod lib lint` compiles the
Objective-C against the real iOS SDK, but it is no longer part of CI — run it by
hand on a Mac.

**None of that is a device, and this is the package where that caveat costs the
most.** Nothing here has proved that a Keychain item survives a real uninstall,
that the Android recovery fires on a real restored backup, or that a
`whenUnlocked` item is genuinely unreadable on a locked screen. See
[`AGENTS.md`](./AGENTS.md) for exactly what each check does and does not cover.

## License

MIT
