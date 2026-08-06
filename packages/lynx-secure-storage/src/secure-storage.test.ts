import { resetNativeChannel, setPeerContext } from '@amritk/mini-lynx-native'
import { installNativeBridge } from '@amritk/mini-lynx-native/background'
import { createFakeContexts, createFakeEmitter } from '@amritk/mini-lynx-native/testing'
import { afterEach, describe, expect, it } from 'vitest'

import { clearSecureStorage } from './clear-secure-storage'
import { getSecureItem } from './get-secure-item'
import { hasSecureItem } from './has-secure-item'
import { isSecureStorageAvailable } from './is-secure-storage-available'
import { MAX_VALUE_BYTES, MODULE } from './native-module'
import { removeSecureItem } from './remove-secure-item'
import { setSecureItem } from './set-secure-item'
import { createFakeSecureStorage, type FakeSecureStorage } from './testing/create-fake-secure-storage'

/**
 * These cases drive the real facade over the real bridge against the fake
 * native module, because the thing worth pinning is the contract between them:
 * the method names, their arities, whether each is a returning or a callback
 * method, and — the part that is this package's own — which failures arrive as
 * values and which arrive as exceptions.
 *
 * They cannot tell you the Kotlin and the Objective-C agree with the fake.
 * Nothing here can — that is what `AGENTS.md` means by the device caveat.
 */

let uninstall: (() => void) | undefined

const setup = (): FakeSecureStorage => {
  const contexts = createFakeContexts()
  const storage = createFakeSecureStorage()
  setPeerContext(contexts.mainThread)
  uninstall = installNativeBridge({
    peer: contexts.background,
    emitter: createFakeEmitter(),
    modules: { [MODULE]: storage.module },
  })
  return storage
}

afterEach(() => {
  uninstall?.()
  uninstall = undefined
  resetNativeChannel()
  setPeerContext(null)
})

describe('secure-storage', () => {
  it('reports the store as available once the module is linked', async () => {
    setup()
    await expect(isSecureStorageAvailable()).resolves.toBe(true)
  })

  it('reports the store as unavailable when the host app did not link it', async () => {
    const contexts = createFakeContexts()
    setPeerContext(contexts.mainThread)
    uninstall = installNativeBridge({
      peer: contexts.background,
      emitter: createFakeEmitter(),
      modules: {},
    })
    await expect(isSecureStorageAvailable()).resolves.toBe(false)
  })

  it('round-trips a value', async () => {
    setup()

    await expect(setSecureItem('session', 'token')).resolves.toEqual({ ok: true })
    await expect(getSecureItem('session')).resolves.toBe('token')
  })

  it('answers null for a key that was never written', async () => {
    setup()
    // The distinction the whole facade is built around: absent is a value, and
    // it is the only thing `null` is ever allowed to mean.
    await expect(getSecureItem('session')).resolves.toBeNull()
  })

  it('replaces the value under a key that already exists', async () => {
    const storage = setup()

    await setSecureItem('session', 'first')
    await setSecureItem('session', 'second')

    await expect(getSecureItem('session')).resolves.toBe('second')
    // One entry, not two: the iOS half updates in place rather than adding a
    // second item, and a fake that grew one would be hiding that.
    expect(Object.keys(storage.stored())).toEqual(['session'])
  })

  it('answers whether a key is present without bringing the value across', async () => {
    setup()

    await expect(hasSecureItem('session')).resolves.toBe(false)
    await setSecureItem('session', 'token')
    await expect(hasSecureItem('session')).resolves.toBe(true)
  })

  it('removes one key and leaves the rest alone', async () => {
    setup()

    await setSecureItem('session', 'token')
    await setSecureItem('refresh', 'other')
    await removeSecureItem('session')

    await expect(getSecureItem('session')).resolves.toBeNull()
    await expect(getSecureItem('refresh')).resolves.toBe('other')
  })

  it('removes a key that is not there without failing', async () => {
    setup()
    // A sign-out path that threw for being run twice would be a worse bug than
    // the one it reported, and neither platform treats this as an error.
    await expect(removeSecureItem('session')).resolves.toBeUndefined()
  })

  it('clears everything the package stored', async () => {
    const storage = setup()

    await setSecureItem('session', 'token')
    await setSecureItem('refresh', 'other')
    await clearSecureStorage()

    expect(storage.stored()).toEqual({})
  })

  it('writes with afterFirstUnlock unless asked otherwise', async () => {
    const storage = setup()

    await setSecureItem('session', 'token')

    // The default matters more than it looks: `whenUnlocked` would make this
    // token unreadable by anything the app does with the screen locked.
    expect(storage.stored()['session']?.accessibility).toBe('afterFirstUnlock')
  })

  it('carries an explicit accessibility across to the native side', async () => {
    const storage = setup()

    await setSecureItem('pin', '1234', { accessibility: 'whenUnlocked' })

    expect(storage.stored()['pin']?.accessibility).toBe('whenUnlocked')
  })

  it('reports a value over the size cap as tooLarge rather than truncating it', async () => {
    setup()

    const oversized = 'a'.repeat(MAX_VALUE_BYTES + 1)
    const result = await setSecureItem('blob', oversized)

    expect(result).toEqual({ ok: false, error: 'tooLarge', message: expect.any(String) })
  })

  it('reports a write to an unavailable store as a value, not a rejection', async () => {
    const storage = setup()
    storage.setAvailable(false)

    // The one function here whose failure is data: an app that has just been
    // handed a credential has to branch on whether it was persisted.
    const result = await setSecureItem('session', 'token')
    expect(result).toEqual({ ok: false, error: 'unavailable', message: expect.any(String) })
  })

  it('throws rather than answering null when the store cannot be read', async () => {
    const storage = setup()

    await setSecureItem('session', 'token')
    storage.breakKeystore(true)

    // This is the assertion the package exists for. A broken store reported as
    // an empty one signs the user out of an app whose credential is intact on
    // the disk, and `null` has to keep meaning exactly one thing.
    await expect(getSecureItem('session')).rejects.toThrow(/keystoreFailure/)
  })

  it('never puts a stored value into the error it throws', async () => {
    const storage = setup()

    await setSecureItem('session', 'super-secret-token')
    storage.breakKeystore(true)

    // Exceptions reach logs, crash reporters and bug reports. The key names the
    // operation; the value never appears anywhere.
    const thrown = await getSecureItem('session').catch((reason: unknown) => reason)
    expect(String(thrown)).toContain('session')
    expect(String(thrown)).not.toContain('super-secret-token')
  })

  it('throws from every read-shaped call when the store cannot be reached', async () => {
    const storage = setup()
    storage.setAvailable(false)

    // `hasSecureItem` answering `false` here would be the same lie in a
    // different shape, and `removeSecureItem` resolving would tell a sign-out
    // path that the credential is gone when it is still there.
    await expect(hasSecureItem('session')).rejects.toThrow(/unavailable/)
    await expect(removeSecureItem('session')).rejects.toThrow(/unavailable/)
    await expect(clearSecureStorage()).rejects.toThrow(/unavailable/)
  })

  it('withholds a whenUnlocked item while the device is locked', async () => {
    const storage = setup()

    await setSecureItem('pin', '1234', { accessibility: 'whenUnlocked' })
    await setSecureItem('session', 'token')
    storage.setDeviceLocked(true)

    // `errSecInteractionNotAllowed`, which is exactly why the default is
    // `afterFirstUnlock` — the session token stays readable by background work.
    await expect(getSecureItem('pin')).rejects.toThrow(/unavailable/)
    await expect(getSecureItem('session')).resolves.toBe('token')
  })

  it('recovers from a corrupted keyset instead of propagating the failure', async () => {
    const storage = setup()

    await setSecureItem('session', 'token')
    storage.corruptKeyset()

    // A restored backup, or a device that dropped its Keystore keys. The store
    // is discarded and recreated, so the value is gone — and the call succeeds,
    // because the alternative is a crash loop on launch.
    await expect(getSecureItem('session')).resolves.toBeNull()
    await expect(setSecureItem('session', 'again')).resolves.toEqual({ ok: true })
    await expect(getSecureItem('session')).resolves.toBe('again')
  })

  it('keeps a value across a process restart', async () => {
    const storage = setup()

    await setSecureItem('session', 'token')
    storage.restartProcess()

    // The disk survives being killed, and so does the first-run flag in
    // `NSUserDefaults` — so nothing is cleared and the session is still there.
    await expect(getSecureItem('session')).resolves.toBe('token')
  })

  it('loses the value on a reinstall, because the first-run flag is what was cleared', async () => {
    const storage = setup()

    await setSecureItem('session', 'token')
    storage.reinstall()

    // Keychain items outlive the app they belong to, so without this the app a
    // user deleted and installed again would find a live session. `NSUserDefaults`
    // is the one thing an uninstall does clear, which is what makes it the signal.
    await expect(getSecureItem('session')).resolves.toBeNull()
    expect(storage.stored()).toEqual({})
  })

  it('runs the first-run wipe once per process and not on every call', async () => {
    const storage = setup()

    storage.reinstall()
    await expect(getSecureItem('session')).resolves.toBeNull()

    // The flag is set by the first call, so a write immediately after it
    // survives. A check that ran per call would wipe this one too.
    await setSecureItem('session', 'fresh')
    await expect(getSecureItem('session')).resolves.toBe('fresh')
  })

  it('reports availability as false while the keystore is broken', async () => {
    const storage = setup()
    storage.breakKeystore(true)

    await expect(isSecureStorageAvailable()).resolves.toBe(false)

    storage.breakKeystore(false)
    await expect(isSecureStorageAvailable()).resolves.toBe(true)
  })
})
