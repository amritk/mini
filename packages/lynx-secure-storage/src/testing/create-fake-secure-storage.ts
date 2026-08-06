import { MAX_VALUE_BYTES } from '../native-module'
import type {
  SecureAccessibility,
  SecureBooleanResult,
  SecureItemOptions,
  SecureStringResult,
  SecureVoidResult,
  SecureWriteError,
  SecureWriteResult,
} from '../types'

/** One stored item, with the attribute the platforms keep beside the value. */
export type FakeSecureItem = {
  readonly value: string
  /** What the write asked for, defaulted the way the native halves default it. */
  readonly accessibility: SecureAccessibility
}

/** The fake module, plus the handles a test needs to play the platform's part. */
export type FakeSecureStorage = {
  /** Register this under `MODULE` in the registry handed to `installNativeBridge`. */
  readonly module: Readonly<Record<string, unknown>>
  /**
   * Everything currently in the store, keyed exactly as it was written.
   *
   * For asserting that a write happened and with which attribute — not for
   * driving the facade, which is what the module is for.
   */
  stored(): Readonly<Record<string, FakeSecureItem>>
  /**
   * Whether the platform's store answers at all. True by default; false is a
   * host that did not link the native half properly, or a simulator build with
   * no keychain-access entitlement, and it is what `unavailable` reports.
   */
  setAvailable(available: boolean): void
  /**
   * Locks or unlocks the device.
   *
   * Only `whenUnlocked` items notice, which is the point: reading one while the
   * screen is locked is `errSecInteractionNotAllowed` on a real device, and it
   * is the failure that makes `afterFirstUnlock` the default. An
   * `afterFirstUnlock` item stays readable, exactly as it does on a phone in a
   * pocket.
   */
  setDeviceLocked(locked: boolean): void
  /**
   * Stages a keyset that can no longer be read — a restored backup, or a device
   * that dropped its Keystore keys when the lock screen changed.
   *
   * The next call **recovers**: the store is discarded and recreated empty, and
   * the call succeeds. That is what the Android half does and it is not a
   * detail — propagating the exception instead is a crash loop on launch, which
   * is the worst outcome available here. Everything written before this is gone
   * afterwards, and reads answer `null` rather than failing.
   */
  corruptKeyset(): void
  /**
   * Breaks the keystore in the way that does **not** recover: the key itself is
   * unusable, so every call answers `keystoreFailure` until this is cleared.
   *
   * This is the case that makes the facade throw instead of answering `null`,
   * and a consumer cannot stage it on a device at all.
   */
  breakKeystore(broken: boolean): void
  /**
   * A process restart: the app was killed and launched again.
   *
   * Stored values survive, because they are on the disk. The first-run flag
   * survives too — it is in `NSUserDefaults`, which survives a restart — so
   * nothing is cleared. Pair it with `reinstall` to tell the two apart.
   */
  restartProcess(): void
  /**
   * A reinstall: the app was deleted and installed again.
   *
   * Keychain items **survive an uninstall on iOS**, so the values are still
   * there — but `NSUserDefaults` does not, so the first-run flag is gone, and
   * the native half reads that as a fresh install and clears the store. The net
   * effect is an empty store, and reproducing the mechanism rather than the net
   * effect is what makes this fake able to catch a regression in it.
   */
  reinstall(): void
}

/**
 * An in-memory stand-in for the native secure-storage module.
 *
 * The point of this is not to test the facade's plumbing — that is three lines
 * per function and the bridge's own suite already covers the wire. It is that
 * **the two native implementations cannot be run here at all**, so the contract
 * between JavaScript and native is otherwise pinned by nothing. This fake is
 * that contract, executable: it implements the same method names, arities and
 * call forms the Kotlin and the Objective-C do, and the suite drives the real
 * facade against it.
 *
 * What it emphatically does **not** verify is that the Kotlin and the
 * Objective-C match it. Nothing in this repository can — see `AGENTS.md`.
 *
 * ## It reproduces the platforms rather than smoothing them over
 *
 * The four things worth staging here are the four a consumer cannot stage on a
 * device: a store that does not answer (`setAvailable`), a locked device with a
 * `whenUnlocked` item behind it (`setDeviceLocked`), a keyset that has to be
 * discarded to be usable again (`corruptKeyset`), and a keystore that is simply
 * broken (`breakKeystore`). `restartProcess` and `reinstall` are the fifth:
 * they differ only in that a reinstall clears `NSUserDefaults`, and that one
 * difference is the whole reason a reinstalled app does not find the previous
 * install's session.
 *
 * Every one of those answers through the same result union the real halves use,
 * so a test drives them through the real facade and sees exactly what an app
 * would see.
 *
 * What it does not model is the cryptography — nothing here is encrypted, and
 * a test that asserted otherwise would be asserting against a `Map`. It also
 * treats `removeSecureItem` and `clearSecureStorage` as reachable on a locked
 * device, where a real Keychain may refuse to delete an item it cannot decrypt.
 *
 * @example
 * ```ts
 * const storage = createFakeSecureStorage()
 * installNativeBridge({ peer, emitter, modules: { [MODULE]: storage.module } })
 *
 * await setSecureItem('session', 'token')
 * storage.reinstall()
 * expect(await getSecureItem('session')).toBeNull()
 * ```
 */
export const createFakeSecureStorage = (): FakeSecureStorage => {
  /** The disk. Survives a restart and an uninstall, exactly as the Keychain does. */
  const items = new Map<string, FakeSecureItem>()

  let available = true
  let locked = false
  let keysetCorrupted = false
  let keystoreBroken = false
  /** `NSUserDefaults`: survives a restart, cleared by an uninstall. */
  let installedFlag = true
  /** Whether this process has run the first-run check yet. */
  let checkedThisProcess = true

  const failure = (error: SecureWriteError, message: string) => ({ ok: false, error, message }) as const

  /**
   * The first-run check both native halves perform once per process.
   *
   * Keychain items outlive the app they belong to, so a reinstall would
   * otherwise find a live session belonging to an install the user deliberately
   * removed. The flag is the only thing here that an uninstall clears, which is
   * what makes it usable as the signal.
   */
  const ensureInstalled = (): void => {
    if (checkedThisProcess) return
    checkedThisProcess = true
    if (installedFlag) return
    items.clear()
    installedFlag = true
  }

  /**
   * Opens the store, and answers with the failure when it cannot be opened.
   *
   * The corrupted-keyset branch is the one that behaves surprisingly on
   * purpose: it succeeds, having thrown everything away. A consumer's data is
   * gone either way, and the difference between recovering and propagating is
   * whether their app opens.
   */
  const open = (): { readonly ok: false; readonly error: SecureWriteError; readonly message: string } | null => {
    ensureInstalled()
    if (!available) return failure('unavailable', 'the platform secure store is not available on this device')
    if (keystoreBroken) return failure('keystoreFailure', 'the keystore key could not be used')
    if (keysetCorrupted) {
      keysetCorrupted = false
      items.clear()
      // No failure: the store has been discarded and recreated, which is what
      // the Android half does rather than letting the exception reach the app.
    }
    return null
  }

  /** True when this item cannot be touched right now because the device is locked. */
  const withheld = (accessibility: SecureAccessibility): boolean => locked && accessibility === 'whenUnlocked'

  /**
   * The UTF-8 length of a value, counted the way both native halves count it.
   *
   * Hand-rolled because `TextEncoder` is a web global rather than an
   * ECMAScript one, and this package compiles against neither a DOM nor Node —
   * the same reason `parseQuery` is hand-rolled in `@amritk/mini-helpers`.
   */
  const utf8Length = (value: string): number => {
    let bytes = 0
    for (const character of value) {
      const code = character.codePointAt(0) ?? 0
      bytes += code < 0x80 ? 1 : code < 0x800 ? 2 : code < 0x10000 ? 3 : 4
    }
    return bytes
  }

  const module = {
    getSecureItem: (key: string, done: (result: SecureStringResult) => void) => {
      const blocked = open()
      if (blocked) return done(blocked)
      const item = items.get(key)
      // A key that is not there is `{ value: null }` and never a failure —
      // which is the distinction the whole facade is built around.
      if (item === undefined) return done({ ok: true, value: null })
      if (withheld(item.accessibility)) {
        return done(failure('unavailable', 'the device is locked and this item is only readable while unlocked'))
      }
      done({ ok: true, value: item.value })
    },

    setSecureItem: (
      key: string,
      value: string,
      options: SecureItemOptions | null,
      done: (result: SecureWriteResult) => void,
    ) => {
      const blocked = open()
      if (blocked) return done(blocked)
      if (utf8Length(value) > MAX_VALUE_BYTES) {
        return done(failure('tooLarge', `a value may be at most ${MAX_VALUE_BYTES} bytes`))
      }
      const accessibility = options?.accessibility ?? 'afterFirstUnlock'
      if (withheld(accessibility)) {
        return done(failure('unavailable', 'the device is locked and this item may only be written while unlocked'))
      }
      // Replaces in place, which is what `SecItemUpdate` does on iOS: there is
      // never a moment where the key is absent.
      items.set(key, { value, accessibility })
      done({ ok: true })
    },

    removeSecureItem: (key: string, done: (result: SecureVoidResult) => void) => {
      const blocked = open()
      if (blocked) return done(blocked)
      // Removing a key that is not there is the ordinary answer, not an error:
      // `errSecItemNotFound` is what a second sign-out gets.
      items.delete(key)
      done({ ok: true })
    },

    hasSecureItem: (key: string, done: (result: SecureBooleanResult) => void) => {
      const blocked = open()
      if (blocked) return done(blocked)
      const item = items.get(key)
      if (item === undefined) return done({ ok: true, value: false })
      if (withheld(item.accessibility)) {
        return done(failure('unavailable', 'the device is locked and this item is only readable while unlocked'))
      }
      done({ ok: true, value: true })
    },

    clearSecureStorage: (done: (result: SecureVoidResult) => void) => {
      const blocked = open()
      if (blocked) return done(blocked)
      items.clear()
      done({ ok: true })
    },

    isSecureStorageAvailable: (done: (available: boolean) => void) => {
      // No first-run check, deliberately: the iOS half does not run one here
      // either. Asking whether a store exists must not be the thing that wipes
      // it, and a caller that goes on to read gets the check then.
      //
      // A corrupted keyset is not unavailable: it recovers on the next call, so
      // answering false here would send an app down a path it does not need.
      done(available && !keystoreBroken)
    },
  } satisfies Record<string, unknown>

  return {
    module,
    stored: () => Object.fromEntries(items),
    setAvailable: (next) => {
      available = next
    },
    setDeviceLocked: (next) => {
      locked = next
    },
    corruptKeyset: () => {
      keysetCorrupted = true
    },
    breakKeystore: (next) => {
      keystoreBroken = next
    },
    restartProcess: () => {
      checkedThisProcess = false
    },
    reinstall: () => {
      installedFlag = false
      checkedThisProcess = false
    },
  }
}
