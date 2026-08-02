/// <reference types="node" />
// Reads the Kotlin and Objective-C sources off disk, so it needs Node's fs and
// path; pulled in explicitly because the package's tsconfig is deliberately
// platform-free (`lib: ["ESNext"]`, `types: []`).

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createFakeEmitter } from '@amritk/mini-lynx-native/testing'
import { describe, expect, it } from 'vitest'

import { EVENTS } from './native-module'
import { createFakeDeepLinking } from './testing/create-fake-deep-linking'

/**
 * The JavaScript-to-native contract, checked across all three implementations
 * of it.
 *
 * There are four statements of this contract — the TypeScript facade, the fake,
 * the Kotlin and the Objective-C — and only two of them run in this repository.
 * `bun run check:android` compiles the Kotlin, and nothing here can compile the
 * Objective-C at all, so the failure this suite exists for is the one a
 * compiler cannot catch on either side: a method renamed in one language and
 * not the others, an argument added on one side only, or an event name that
 * drifts.
 *
 * Every one of those produces code that compiles everywhere and fails at the
 * bridge, at runtime, on a device, with a rejected promise and no clue as to
 * why. Parsing the two native surfaces is a blunt instrument, and it is a great
 * deal better than finding out that way.
 *
 * Deliberately NOT checked here: whether the implementations are *correct*.
 * This suite reads signatures. `check:android` proves the Kotlin compiles. That
 * a link actually arrives when the user taps one in their mail client is a
 * device's answer to give.
 */

const PACKAGE_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

const read = (path: string): string => readFileSync(join(PACKAGE_ROOT, path), 'utf-8')

const ANDROID_SOURCES = 'android/src/main/java/dev/amritk/minilynx/deeplinking'

const KOTLIN = read(`${ANDROID_SOURCES}/MiniLynxDeepLinkingModule.kt`)
const KOTLIN_EVENTS = read(`${ANDROID_SOURCES}/DeepLinkEvents.kt`)
const MANIFEST = read('android/src/main/AndroidManifest.xml')
const OBJC = read('ios/src/MiniLynxDeepLinkingModule.m')
const OBJC_CENTER = read('ios/src/MiniLynxDeepLinkingCenter.m')

/** How many arguments a native method takes, keyed by its JavaScript name. */
type Surface = Map<string, number>

/**
 * The `@LynxMethod` surface.
 *
 * Kotlin's parameter list is the arity directly, trailing `Callback` included —
 * on this bridge a callback is an argument like any other, which is exactly why
 * it has to be counted the same way on all three sides.
 */
const kotlinSurface = (): Surface => {
  const surface: Surface = new Map()
  const pattern = /@LynxMethod\s+(?:@\w+\s+)*fun\s+(\w+)\s*\(([^)]*)\)/g
  for (const [, name, params] of KOTLIN.matchAll(pattern)) {
    const trimmed = (params ?? '').trim()
    surface.set(name as string, trimmed === '' ? 0 : trimmed.split(',').length)
  }
  return surface
}

/**
 * The `methodLookup` table.
 *
 * An Objective-C selector states its own arity: one colon per argument. That
 * makes this the one place the iOS side can be checked without a compiler —
 * and it is worth checking, because a selector string that does not match the
 * method below it is not a build error on iOS either. It fails when Lynx tries
 * to dispatch, on a device.
 */
const objcSurface = (): Surface => {
  const surface: Surface = new Map()
  const pattern = /@"(\w+)"\s*:\s*NSStringFromSelector\(@selector\(([^)]*)\)\)/g
  for (const [, name, selector] of OBJC.matchAll(pattern)) {
    surface.set(name as string, ((selector ?? '').match(/:/g) ?? []).length)
  }
  return surface
}

/** The fake's surface, read from the object rather than parsed — it is right here. */
const fakeSurface = (): Surface => {
  const { module } = createFakeDeepLinking(createFakeEmitter())
  const surface: Surface = new Map()
  for (const [name, value] of Object.entries(module)) {
    if (typeof value === 'function') surface.set(name, value.length)
  }
  return surface
}

/** The facade files that reach the native module. Listed so a new one cannot be silently missed. */
const FACADE_FILES = ['can-open-url.ts', 'get-initial-url.ts', 'on-deep-link.ts', 'open-settings.ts', 'open-url.ts']

/**
 * Every native method the facade calls, and how many arguments it hands over.
 *
 * `callNativeAsync` appends a callback on the way across, so its call sites are
 * one argument short of the native arity. Encoding that here is the point:
 * getting the two spellings the wrong way round is a promise that never settles
 * or a result that is always `undefined`, and neither says so.
 */
const facadeCalls = (): Surface => {
  const surface: Surface = new Map()
  const pattern = /callNative(Async)?(?:<[^>]*>)?\(\s*MODULE,\s*'([^']+)'([^)]*)\)/g

  for (const file of FACADE_FILES) {
    const source = read(`src/${file}`)
    for (const [, isAsync, name, rest] of source.matchAll(pattern)) {
      const args = (rest ?? '').trim().replace(/^,/, '').trim()
      const passed = args === '' ? 0 : args.split(',').length
      surface.set(name as string, passed + (isAsync ? 1 : 0))
    }
  }
  return surface
}

const sorted = (surface: Surface): string[] => [...surface.keys()].sort()

describe('native-contract', () => {
  it('finds a method surface in each implementation', () => {
    // A regex that silently matched nothing would make every comparison below
    // pass by agreeing that all three surfaces are empty.
    expect(kotlinSurface().size).toBeGreaterThanOrEqual(5)
    expect(objcSurface().size).toBeGreaterThanOrEqual(5)
    expect(fakeSurface().size).toBeGreaterThanOrEqual(5)
  })

  it('exposes the same method names from Kotlin, Objective-C and the fake', () => {
    expect(sorted(kotlinSurface())).toEqual(sorted(fakeSurface()))
    expect(sorted(objcSurface())).toEqual(sorted(fakeSurface()))
  })

  it('agrees on how many arguments each method takes', () => {
    const kotlin = kotlinSurface()
    const objc = objcSurface()

    for (const [name, arity] of fakeSurface()) {
      expect(kotlin.get(name), `Kotlin arity of ${name}`).toBe(arity)
      expect(objc.get(name), `Objective-C selector arity of ${name}`).toBe(arity)
    }
  })

  it('calls only methods that exist, with the arity the native side declares', () => {
    const fake = fakeSurface()

    for (const [name, arity] of facadeCalls()) {
      expect(fake.has(name), `the facade calls "${name}", which no implementation has`).toBe(true)
      expect(fake.get(name), `arity the facade calls ${name} with`).toBe(arity)
    }
  })

  it('leaves no native method unreachable from the facade', () => {
    // The other direction: a method implemented three times over that nothing
    // can call is dead weight in two languages that cannot be tested here.
    const called = facadeCalls()
    for (const name of fakeSurface().keys()) {
      expect(called.has(name), `"${name}" is implemented natively but never called`).toBe(true)
    }
  })

  it('spells the event name identically in all three languages', () => {
    const names = (source: string): string[] =>
      [...new Set(source.match(/mini-lynx:deep-linking:[\w-]+/g) ?? [])].sort()

    const expected = Object.values(EVENTS).sort()
    expect(names(KOTLIN_EVENTS)).toEqual(expected)
    expect(names(OBJC_CENTER)).toEqual(expected)
  })

  it('registers the module under the same name on both platforms', () => {
    // `MODULE` in TypeScript, `@LynxNativeModule(name = …)` in Kotlin and
    // `+name` in Objective-C are the key `NativeModules` exposes the module
    // under. A mismatch is a module that is simply not there.
    expect(KOTLIN).toContain('@LynxNativeModule(name = "MiniLynxDeepLinkingModule")')
    expect(OBJC).toContain('return @"MiniLynxDeepLinkingModule";')
  })

  it('points every Objective-C selector at a method that exists', () => {
    // The one failure `pod lib lint` cannot catch either: a selector string in
    // `methodLookup` that names no method is not a build error on iOS, because
    // the string is only resolved when Lynx tries to dispatch through it. It
    // fails at call time, on a device, as a promise that never settles.
    //
    // Method names are matched rather than full signatures — the arity is
    // already checked against Kotlin and the fake above, so the part that is
    // unverifiable anywhere else is simply whether the method is there at all.
    const implemented = new Set([...OBJC.matchAll(/^-\s*\([^)]*\)\s*(\w+)/gm)].map(([, name]) => name as string))

    const selectors = [...OBJC.matchAll(/NSStringFromSelector\(@selector\((\w+)/g)].map(([, name]) => name as string)
    expect(selectors.length).toBeGreaterThanOrEqual(5)

    for (const selector of selectors) {
      expect(implemented.has(selector), `no method implements the selector "${selector}"`).toBe(true)
    }
  })

  it('agrees on the error codes both native sides can report', () => {
    // A code that only one platform can produce is a branch an app writes and
    // never sees fire, and a code the facade does not model arrives as a string
    // no `OpenErrorCode` covers.
    const codes = ['invalidURL', 'noHandler', 'unavailable']
    for (const code of codes) {
      expect(KOTLIN_EVENTS, `Kotlin never reports "${code}"`).toContain(`"${code}"`)
      expect(OBJC_CENTER, `Objective-C never reports "${code}"`).toContain(`@"${code}"`)
    }
  })

  it('publishes the link payload under the key the facade reads', () => {
    // `DeepLink.url` is one string in three languages. A native side that
    // published `link` instead would deliver an event whose `url` is undefined
    // — no error anywhere, and every navigation goes to the same wrong place.
    expect(KOTLIN_EVENTS).toContain('putString("url"')
    expect(OBJC_CENTER).toContain('@{@"url" : url}')
  })

  it('keeps the Android manifest entries the cold-start capture depends on', () => {
    // `getInitialURL` answers null without this provider, on a build where
    // everything compiled and every test above passed: the initialiser is
    // registered by the manifest and by nothing else.
    expect(MANIFEST).toContain('android:name=".DeepLinkInitializer"')
    // A fixed authority would fail to INSTALL on a device that already has
    // another app built with this library.
    expect(MANIFEST).toContain(`android:authorities="\${applicationId}.minilynxdeeplinking"`)
    // Without `<queries>`, `openURL('mailto:…')` reports `noHandler` on
    // Android 11+ even though the device plainly has a mail client.
    expect(MANIFEST).toContain('<queries>')
  })
})
