# AGENTS.md — @amritk/lynx-secure-storage

Contributor guide for AI agents editing **this package**. Repo-wide rules:
[`../../AGENTS.md`](../../AGENTS.md) and [`../../CLAUDE.md`](../../CLAUDE.md).
Consuming the package instead? See [`AI.md`](./AI.md).

Encrypted key-value storage for Lynx: the iOS Keychain, Android's
`EncryptedSharedPreferences`, and a promise-shaped facade over
`@amritk/mini-lynx-native`.

It is the fifth native module in this repository and it deliberately mirrors the
four before it — [`../lynx-dialogs`](../lynx-dialogs) is the closest, because
that one has no events either. When you change something structural here, check
the others for the same shape, and the other way round.

## Commands

```bash
bun run --filter='@amritk/lynx-secure-storage' test
bun run --filter='@amritk/lynx-secure-storage' types:check
bun run --filter='@amritk/lynx-secure-storage' build

# Compiles the Kotlin against the real Lynx AAR and packages an AAR.
# Runs for every package with an Android half, this one included.
# Needs ANDROID_HOME with platforms/android-35; skips with a message without one.
bun run check:android
```

The iOS half is not compiled anywhere automatic: the macOS CI job that ran
`pod lib lint` is commented out in `.github/workflows/ci.yml` because it cost 81
minutes a run, and there is no way to build it on Linux at all. Run it by hand
on a Mac when you touch `ios/`. See "What is verified, and what is not" below,
which is the most important thing on this page.

## Layout

```
src/
  index.ts                     The `.` entry — every function, re-exported
  types.ts                     The shapes that cross to native, plus the wire
                               results the facade unwraps
  native-module.ts             MODULE and MAX_VALUE_BYTES — the only string and
                               the only number that cross
  get-secure-item.ts / set-secure-item.ts / remove-secure-item.ts
  has-secure-item.ts / clear-secure-storage.ts / is-secure-storage-available.ts
  unwrap-secure-result.ts      The one place a native failure becomes a throw
  native-contract.test.ts      Parses both native surfaces, compares to this one
  secure-storage.test.ts       The facade over the real bridge, against the fake
  testing/
    create-fake-secure-storage.ts   The native contract, executable
android-check/                 A standalone Gradle project that COMPILES ../android
android/
  build.gradle.kts             The one implementation dependency in the repo
  src/main/AndroidManifest.xml           Contributes the backup exclusion
  src/main/res/xml/minilynx_secure_storage_backup_rules.xml          API ≤ 30
  src/main/res/xml/minilynx_secure_storage_data_extraction_rules.xml API ≥ 31
  src/main/java/dev/amritk/minilynx/securestorage/
    MiniLynxSecureStorageModule.kt   The @LynxMethod surface, and the one thread
    SecureStore.kt                   The store, and the recovery that is the point
    StorageResults.kt                Every string that crosses
ios/
  MiniLynxSecureStorage.podspec
  src/MiniLynxSecureStorageModule.{h,m}     The methodLookup surface, and the queue
  src/MiniLynxSecureStorageKeychain.{h,m}   Every SecItem call, and the first-run wipe
lynx.lib.json                  The autolink manifest
```

## Invariants — do not break these

- **`src/testing/create-fake-secure-storage.ts` IS the native contract.** Method
  names, arities and call forms are agreed in three places — the fake, the
  Kotlin and the Objective-C — and only the fake is executable here. Changing a
  method means changing all three in the same commit, and the fake is the one
  that will tell you if you got the TypeScript side wrong. Never "fix" a test by
  loosening the fake toward what the facade happens to do.
- **`null` from a read means absent, and nothing else.** This is the package's
  reason to exist in the shape it has. `setSecureItem` answers a
  `SecureWriteResult`; every other function throws when the store cannot be
  reached, because their return types have no failure arm and a broken store
  reported as an empty one signs a user out of an app whose credential is intact
  on the disk. Do not "helpfully" make `getSecureItem` swallow a failure, and do
  not make `setSecureItem` throw — an app that has just been handed a credential
  has to branch on whether it was persisted.
- **Never log a value, at any level, on either platform.** Everything here is a
  secret by construction and a log line is a file on the device. Failure
  messages name an `OSStatus` or an exception class and never the key's
  contents. `native-contract.test.ts` fails the build on a logging call in
  either native half — that check is cheap and it is the only thing standing
  between this package and the debugging session that prints a token.
- **Every iOS protection class keeps its `ThisDeviceOnly` suffix.** Without it
  the item is eligible for iCloud Keychain and encrypted backups, so a
  credential the app was asked to keep on one device ends up on every device the
  user owns — and nothing fails, warns or behaves differently. The parity suite
  greps for a bare `kSecAttrAccessible*` for exactly this reason. There is no
  option to turn syncing on, deliberately: that is a product decision, not a
  storage library's.
- **A write updates in place — `SecItemUpdate`, then `SecItemAdd` only if there
  was nothing to update.** The obvious delete-then-add has a window in which the
  credential does not exist, and the system kills apps precisely there: in the
  background, mid-write. `SecItemUpdate` can change `kSecAttrAccessible` in the
  same call, so a re-write with a different accessibility does not need the
  window either.
- **A corrupted or invalidated Android keyset is recovered from, never
  propagated.** `EncryptedSharedPreferences` throws on `create` when its keyset
  cannot be read — after a restore, or on devices that drop Keystore keys when
  the lock screen changes — and for most apps `create` is on the path to the
  first screen. The data is unrecoverable either way; the only question is
  whether the app opens. `SecureStore` discards the preferences file *and* the
  master key entry and rebuilds both. A crash loop on launch is the worst
  outcome available here.
- **The master key alias is this package's own, not
  `MasterKey.DEFAULT_MASTER_KEY_ALIAS`.** The recovery above deletes the key
  entry, and the default alias is shared by every library in the process that
  took the default — so taking it would mean destroying another library's store
  to fix ours.
- **The Android half runs on one thread, and the store is `@Synchronized`.** Two
  concurrent recoveries would each delete what the other had just created, which
  is the one way to turn a store that recovers into a store that never opens
  again. The iOS half uses a serial `dispatch_queue` for the same reason, plus
  one of its own: two `SecItemUpdate`s racing on the same account have an
  undefined winner.
- **The backup exclusion lives in the library's manifest, not in the README.**
  Auto-backup is on by default, the Keystore key never leaves the device, and a
  restored file is undecryptable ciphertext — which reads to an app as
  corruption rather than as a signed-out user. A host that declares its own
  backup rules gets a manifest-merger failure, and that is the intended
  outcome: it is a decision the app owns, and a build error is the only way to
  make it a decision at all. `native-contract.test.ts` checks that the file name
  in the rules still matches the one `SecureStore` writes, because a rename on
  one side is completely silent — the store keeps working and quietly starts
  being backed up.
- **`kSecAttrService` is the bundle identifier, and never nil.** A query with no
  service would widen to every generic password the app can see, and `clear`
  would then delete them. The fallback constant exists for the one host with no
  bundle identifier (a test host) for exactly that reason.
- **The first-run wipe is keyed on `NSUserDefaults`, and the flag is set only
  after a successful clear.** Keychain items outlive the app they belong to;
  `NSUserDefaults` does not, which is what makes its absence the signal. Setting
  the flag on a failed clear — a first launch with no entitlement, or one that
  raced the keybag — would record a wipe that never happened and leave the
  previous install's credential readable forever.
- **`MAX_VALUE_BYTES` is one number in three languages.** Neither platform
  imposes it; this package does, so that a value which stores on one phone
  stores on the other. Counted in UTF-8 bytes on all three sides, because
  counting characters would make the cap mean something different for a Japanese
  token.
- **`accessibility` is iOS only, and the Kotlin says so rather than pretending.**
  Android's Keystore key is usable whenever the process runs;
  `setUnlockedDeviceRequired` is per-*key* and API 28+, so honouring it there
  would mean a second master key, a second preferences file and a read that has
  to look in both. A policy check against `KeyguardManager` would be worse than
  either: it looks like a security boundary from JavaScript and is not one.
- **No biometric gating in this version.** `LAContext` and
  `setUserAuthenticationRequired` need a prompt, a lifecycle, a cancellation
  path and their own failure modes on each platform. Half of it shipped would be
  worse than none, because an app would wire a credential to a gate that only
  works on one platform.
- **No signals, and no `alien-signals` dependency.** A second edge onto the
  signal engine is how a consumer ends up with two reactive graphs that cannot
  see each other's writes. `scripts/consumer-e2e.test.ts` asserts the absent
  dependency.

## The one implementation dependency in the repository

`androidx.security:security-crypto` is the first `implementation` dependency any
package here has taken — `@amritk/lynx-dialogs` has none at all and
`@amritk/lynx-location` refuses Play Services outright. The alternative is
writing the envelope by hand: an AES key in the AndroidKeyStore, GCM over every
value, IV management, and the key-rotation and key-invalidation paths. That is a
cryptographic implementation inside a UI library, and this is the maintained one
Google ships for the job.

Two things to know before touching the version:

- It is pinned to `1.1.0-alpha06`. Later releases of this library have carried
  deprecation annotations, and `check:android` **fails on Kotlin warnings** — so
  a bump can turn green into red for a reason that has nothing to do with this
  package's code.
- Google's own guidance on this library has been unstable. If it is retired
  outright, the migration is Tink directly, which is what it wraps — not a
  rewrite of this package's surface.

## Why this package has no events

`@amritk/lynx-notifications`, `@amritk/lynx-location` and
`@amritk/lynx-deep-linking` all publish through `GlobalEventEmitter`, because
something outside the app decides when they have news. Nothing outside the app
writes to this store: every value in it got there because this package put it
there. So every method is the plain request/response shape `callNativeAsync` was
built for, and there is no `Events` file, no context fan-out and no cold-start
buffer to keep in step across two languages.

`@amritk/lynx-dialogs` reaches the same shape by a different argument — the app
asks, the user answers once, and it is over.

## What is verified, and what is not

Four things state this package's contract — the facade, the fake, the Kotlin and
the Objective-C — and they are checked at three different strengths. Know which
one you are relying on before trusting a green run.

| Check | Command | Strength |
| --- | --- | --- |
| Facade behaviour | `bun run test` | real code, fake platform |
| Cross-language signatures and facts | `src/native-contract.test.ts` | parses Kotlin + Objective-C + the Android resources, compares to TypeScript |
| Kotlin compiles + packages | `bun run check:android` | real `org.lynxsdk.lynx:lynx` AAR, real Android SDK |
| Objective-C compiles | `pod lib lint` (manual, macOS — not in CI) | real Lynx pod, real iOS SDK |

`native-contract.test.ts` is the cheapest of these and catches the failures a
compiler cannot on either side: a method renamed in one language, an argument
added in one, an error code only one platform can report, a result key spelled
differently. It carries three checks its siblings do not — the `ThisDeviceOnly`
protection classes, the backup-exclusion file name, and the no-logging rule —
because each of those is a security property that no signature comparison would
look at and that fails silently on a device. Every assertion in it has been
mutation-checked; **do that again if you change it**, because a parity test that
cannot fail is worse than none.

**None of that is a device**, and this is the package where that gap costs the
most: every one of its interesting behaviours is a platform behaviour. Still
unverified, and worth checking on hardware first:

- that a Keychain item really does survive an uninstall, and that the
  `NSUserDefaults` flag really is cleared by one — the whole reinstall story
  rests on both halves of that;
- that the Android recovery fires on a genuinely restored backup, rather than on
  the simulated corruption the fake stages, and that `deleteSharedPreferences`
  plus a Keystore `deleteEntry` is enough to make the next `create` succeed;
- that the backup exclusion actually keeps the file out of a real Google backup
  and a real device transfer;
- that a `whenUnlocked` item is genuinely unreadable on a locked screen, and
  that an `afterFirstUnlock` item genuinely is readable there after a reboot;
- that `@LynxNativeModule` on a class extending `LynxContextModule` actually
  registers — it compiles, but whether Lynx's processor picks it up without the
  generated Spec its own template extends is untested, and it is untested in
  every native package here;
- that `Callback.invoke(JavaOnlyMap)` arrives as a single object argument on the
  JavaScript side, which every result here assumes.

Carry the caveat the way the four siblings carry theirs: state it, do not let a
green suite imply more than it proves, and narrow it only when something has
actually checked.

## Adding a method

The six here share everything that is hard: the thread, the store, the recovery
and the result shape. A new one is a `@LynxMethod` plus a selector plus a fake
method plus a facade file — and what is not optional is doing it in **one commit
across four places**, `methodLookup` included. The parity suite will catch a
method missing from one of them, and it cannot catch one that is present
everywhere and means something different in each.

Before adding anything that returns a value, decide which side of the throw
rule it is on, and write the reason down.

Then add it to the playground. `apps/playground-mini-lynx/src/screens/secure-storage.tsx`
drives this package's shipping facade against its published fake, over the real
bridge, and it is the only place in the repository where any of this is used the
way a consumer uses it. A new method with no panel there is a method nobody has
actually tried.

Add a changeset for every change (`bunx changeset`).
