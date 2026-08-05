import { afterEach, describe, expect, it } from 'vitest'

import { installNativeBridge } from './background/install-bridge'
import type { NativeModuleRegistry } from './background/native-globals'
import { callNative } from './call-native'
import { callNativeAsync } from './call-native-async'
import { resetNativeChannel } from './channel'
import { setPeerContext } from './current-context'
import { isNativeModuleAvailable } from './is-native-module-available'
import { onNativeEvent } from './on-native-event'
import { createFakeContexts, type FakeContexts } from './testing/create-fake-contexts'
import { createFakeEmitter, type FakeEmitter } from './testing/create-fake-emitter'

/**
 * These cases drive the whole round trip rather than either half alone: a call
 * leaves the main-thread channel, crosses the fake contexts, is served against
 * a fake `NativeModules`, and comes back as a settled promise. That is the only
 * level at which the handshake — the part with a real ordering hazard — means
 * anything, and it is the code that ships on both ends.
 */

const modules: NativeModuleRegistry = {
  StorageModule: {
    getValue: (key: string) => (key === 'token' ? 'abc123' : null),
    setValue: () => undefined,
    loadValue: (key: string, done: (value: unknown) => void) => done(`loaded:${key}`),
    explode: () => {
      throw new Error('native side blew up')
    },
    callTwice: (done: (value: unknown) => void) => {
      done('first')
      done('second')
    },
  },
}

let uninstall: (() => void) | undefined

/** Wires both halves together, with the background one installed up front. */
const setup = (): { contexts: FakeContexts; emitter: FakeEmitter } => {
  const contexts = createFakeContexts()
  const emitter = createFakeEmitter()
  setPeerContext(contexts.mainThread)
  uninstall = installNativeBridge({ peer: contexts.background, modules, emitter })
  return { contexts, emitter }
}

afterEach(() => {
  uninstall?.()
  uninstall = undefined
  resetNativeChannel()
  setPeerContext(null)
})

describe('channel', () => {
  it('resolves a returning native method with its return value', async () => {
    setup()
    await expect(callNative('StorageModule', 'getValue', 'token')).resolves.toBe('abc123')
  })

  it('resolves a callback native method with the first callback argument', async () => {
    setup()
    await expect(callNativeAsync('StorageModule', 'loadValue', 'profile')).resolves.toBe('loaded:profile')
  })

  // The two ways round to get the call form wrong, pinned because they fail
  // differently and the difference is what a caller has to recognise. The
  // symmetric-sounding summary — "one hangs, the other gives you undefined" —
  // is only half right, and it is the half that sends people looking in the
  // wrong place.
  it('settles when callNative is used on a callback method, rather than hanging', async () => {
    setup()
    // This method reaches for the callback it was not handed, so the throw comes
    // back as a rejection. One that merely stored it would resolve `undefined`.
    // Either way the promise settles: the `return` form always replies.
    await expect(callNative('StorageModule', 'loadValue', 'profile')).rejects.toThrow(/not a function/)
  })

  it('never settles when callNativeAsync is used on a returning method', async () => {
    setup()
    // The appended callback is an argument the method ignores, so nothing ever
    // invokes it and no reply is ever sent. This is the silent one.
    const unsettled = Symbol('unsettled')
    const pending = callNativeAsync('StorageModule', 'getValue', 'token')
    await expect(Promise.race([pending, Promise.resolve(unsettled)])).resolves.toBe(unsettled)
  })

  it('rejects a call to a module the host app did not link', async () => {
    setup()
    await expect(callNative('CameraModule', 'open')).rejects.toThrow(/not linked/)
  })

  it('rejects a call to a method the linked module does not have', async () => {
    setup()
    await expect(callNative('StorageModule', 'getValueV2')).rejects.toThrow(/no method/)
  })

  it('rejects with the native error message when the native side throws', async () => {
    setup()
    await expect(callNative('StorageModule', 'explode')).rejects.toThrow('native side blew up')
  })

  it('settles once when a native method invokes its callback more than once', async () => {
    setup()
    await expect(callNativeAsync('StorageModule', 'callTwice')).resolves.toBe('first')
  })

  it('reports whether a module and a method are available', async () => {
    setup()
    await expect(isNativeModuleAvailable('StorageModule')).resolves.toBe(true)
    await expect(isNativeModuleAvailable('StorageModule', 'getValue')).resolves.toBe(true)
    await expect(isNativeModuleAvailable('StorageModule', 'getValueV2')).resolves.toBe(false)
    await expect(isNativeModuleAvailable('CameraModule')).resolves.toBe(false)
  })

  it('queues calls made before the background half is installed', async () => {
    const contexts = createFakeContexts()
    setPeerContext(contexts.mainThread)

    // The main-thread chunk runs first on a device: this is a call made during
    // a component build, before the background chunk has executed at all.
    const pending = callNative('StorageModule', 'getValue', 'token')
    uninstall = installNativeBridge({ peer: contexts.background, modules })

    await expect(pending).resolves.toBe('abc123')
  })

  it('forwards a native event to a subscriber', async () => {
    const { emitter } = setup()
    const seen: unknown[] = []
    onNativeEvent('deeplink', (...args) => seen.push(...args))

    emitter.emit('deeplink', 'mini://settings')

    expect(seen).toEqual(['mini://settings'])
  })

  it('holds one emitter listener per name however many subscribers there are', () => {
    const { emitter } = setup()
    const first = onNativeEvent('deeplink', () => {})
    const second = onNativeEvent('deeplink', () => {})

    expect(emitter.listenerCount('deeplink')).toBe(1)

    first()
    expect(emitter.listenerCount('deeplink')).toBe(1)

    second()
    expect(emitter.listenerCount('deeplink')).toBe(0)
  })

  it('keeps delivering to the other subscribers when one listener throws', () => {
    const { emitter } = setup()
    const seen: unknown[] = []
    onNativeEvent('deeplink', () => {
      throw new Error('a screen handled this badly')
    })
    onNativeEvent('deeplink', (url) => seen.push(url))

    emitter.emit('deeplink', 'mini://settings')

    expect(seen).toEqual(['mini://settings'])
  })

  it('replays subscriptions when the background half is reinstalled', () => {
    const { contexts, emitter } = setup()
    const seen: unknown[] = []
    onNativeEvent('deeplink', (url) => seen.push(url))

    // A reload tears the background half down and installs a fresh one, which
    // is forwarding nothing. The context proxies themselves outlive it — they
    // are the engine's, not the bridge's — so the main-thread channel stays
    // attached, and it is the only side that still knows what was subscribed.
    uninstall?.()
    expect(emitter.listenerCount('deeplink')).toBe(0)

    uninstall = installNativeBridge({ peer: contexts.background, modules, emitter })
    expect(emitter.listenerCount('deeplink')).toBe(1)

    emitter.emit('deeplink', 'mini://settings')
    expect(seen).toEqual(['mini://settings'])
  })

  it('rejects calls still in flight when the channel is reset', async () => {
    const contexts = createFakeContexts()
    setPeerContext(contexts.mainThread)

    // Never installed, so this call is queued and nothing will ever answer it.
    const pending = callNative('StorageModule', 'getValue', 'token')
    resetNativeChannel()

    await expect(pending).rejects.toThrow(/reset before this call was answered/)
  })
})
