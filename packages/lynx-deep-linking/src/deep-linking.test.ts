import { resetNativeChannel, setPeerContext } from '@amritk/mini-lynx-native'
import { installNativeBridge } from '@amritk/mini-lynx-native/background'
import { createFakeContexts, createFakeEmitter } from '@amritk/mini-lynx-native/testing'
import { afterEach, describe, expect, it } from 'vitest'

import { canOpenURL } from './can-open-url'
import { getInitialURL } from './get-initial-url'
import { isDeepLinkingAvailable } from './is-deep-linking-available'
import { MODULE } from './native-module'
import { onDeepLink } from './on-deep-link'
import { openSettings } from './open-settings'
import { openURL } from './open-url'
import { createFakeDeepLinking, type FakeDeepLinking } from './testing/create-fake-deep-linking'
import type { DeepLink } from './types'

/**
 * These cases drive the real facade over the real bridge against the fake
 * native module, because the thing worth pinning is the contract between them:
 * the method names, their arities, and whether each is a returning or a
 * callback method. Get any of those wrong and the facade compiles, ships, and
 * fails on a device.
 *
 * They cannot tell you the Kotlin and the Objective-C agree with the fake.
 * Nothing here can — that is what `AGENTS.md` means by the device caveat.
 */

let uninstall: (() => void) | undefined

const setup = (): FakeDeepLinking => {
  const contexts = createFakeContexts()
  const emitter = createFakeEmitter()
  const linking = createFakeDeepLinking(emitter)
  setPeerContext(contexts.mainThread)
  uninstall = installNativeBridge({
    peer: contexts.background,
    emitter,
    modules: { [MODULE]: linking.module },
  })
  return linking
}

/** Lets the bridge's queued messages and the promises they settle drain. */
const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0))

afterEach(() => {
  uninstall?.()
  uninstall = undefined
  resetNativeChannel()
  setPeerContext(null)
})

describe('deep-linking', () => {
  it('reports the module as available once it is linked', async () => {
    setup()
    await expect(isDeepLinkingAvailable()).resolves.toBe(true)
  })

  it('reports the module as unavailable when the host app did not link it', async () => {
    const contexts = createFakeContexts()
    setPeerContext(contexts.mainThread)
    uninstall = installNativeBridge({ peer: contexts.background, modules: {} })

    await expect(isDeepLinkingAvailable()).resolves.toBe(false)
  })

  it('resolves the URL that launched the app', async () => {
    const linking = setup()
    linking.setInitialURL('myapp://order/42')

    await expect(getInitialURL()).resolves.toBe('myapp://order/42')
  })

  it('resolves null when the app was not launched from a link', async () => {
    setup()
    await expect(getInitialURL()).resolves.toBeNull()
  })

  it('keeps answering with the launch URL rather than the latest one', async () => {
    const linking = setup()
    linking.setInitialURL('myapp://order/42')
    const seen: DeepLink[] = []
    onDeepLink((link) => seen.push(link))
    await settle()

    linking.deliver('myapp://order/99')
    await settle()

    // Two different questions: what started this process, and what has happened
    // since. An app that conflated them would re-run its launch navigation.
    await expect(getInitialURL()).resolves.toBe('myapp://order/42')
    expect(seen).toEqual([{ url: 'myapp://order/99' }])
  })

  it('delivers links that arrive while the app is running', async () => {
    const linking = setup()
    const seen: string[] = []
    const stop = onDeepLink(({ url }) => seen.push(url))
    await settle()

    linking.deliver('myapp://a')
    linking.deliver('myapp://b')
    stop()
    linking.deliver('myapp://c')
    await settle()

    expect(seen).toEqual(['myapp://a', 'myapp://b'])
  })

  it('replays a link that arrived before anything was listening', async () => {
    const linking = setup()
    // The case `getInitialURL` cannot cover: the process was alive, so this is
    // not a launch, but no view was up to receive it.
    linking.hold('myapp://held')

    const seen: string[] = []
    onDeepLink(({ url }) => seen.push(url))
    await settle()

    expect(seen).toEqual(['myapp://held'])
  })

  it('replays the held link only once', async () => {
    const linking = setup()
    linking.hold('myapp://held')

    const first: string[] = []
    const second: string[] = []
    onDeepLink(({ url }) => first.push(url))
    await settle()
    onDeepLink(({ url }) => second.push(url))
    await settle()

    // The cold-start link is one interaction, not a state to be read
    // repeatedly. A second subscriber getting it again would double-navigate.
    expect(first).toEqual(['myapp://held'])
    expect(second).toEqual([])
  })

  it('opens a URL the device handles', async () => {
    const linking = setup()

    await expect(openURL('https://example.com')).resolves.toEqual({ ok: true })
    expect(linking.opened()).toEqual(['https://example.com'])
  })

  it('reports a scheme the host app cannot see as noHandler', async () => {
    setup()

    // Not a device without the app: a host app whose manifest never declared
    // it wanted to see that scheme. Both platforms answer the same way.
    const result = await openURL('whatsapp://send?phone=15550100')
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBe('noHandler')
  })

  it('reports a URL with no scheme as invalidURL', async () => {
    setup()

    const result = await openURL('/orders/42')
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBe('invalidURL')
  })

  it('opens a declared scheme once the host app has declared it', async () => {
    const linking = setup()
    linking.setHandledSchemes(['https', 'whatsapp'])

    await expect(openURL('whatsapp://send?phone=15550100')).resolves.toEqual({ ok: true })
  })

  it('answers whether a URL can be opened without opening it', async () => {
    const linking = setup()

    await expect(canOpenURL('mailto:a@example.com')).resolves.toBe(true)
    await expect(canOpenURL('whatsapp://send')).resolves.toBe(false)
    await expect(canOpenURL('not a url')).resolves.toBe(false)
    expect(linking.opened()).toEqual([])
  })

  it('opens the app settings page', async () => {
    const linking = setup()

    await expect(openSettings()).resolves.toBe(true)
    expect(linking.settingsOpened()).toBe(1)
  })

  it('rejects a call made when the module is not linked', async () => {
    const contexts = createFakeContexts()
    setPeerContext(contexts.mainThread)
    uninstall = installNativeBridge({ peer: contexts.background, modules: {} })

    // The bridge rejects a call it could not make, which is a different thing
    // from a call that reached the module and came back with `ok: false`.
    await expect(openURL('https://example.com')).rejects.toThrow()
  })
})
