/// <reference types="node" />
// Reads the Kotlin, the Objective-C and the Android resources off disk, so it
// needs Node's fs and path; pulled in explicitly because the package's tsconfig
// is deliberately platform-free (`lib: ["ESNext"]`, `types: []`).

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

import { MAX_VALUE_BYTES } from './native-module'
import { createFakeSecureStorage } from './testing/create-fake-secure-storage'

/**
 * The JavaScript-to-native contract, checked across all three implementations
 * of it.
 *
 * There are four statements of this contract — the TypeScript facade, the fake,
 * the Kotlin and the Objective-C — and only two of them run in this repository.
 * `bun run check:android` compiles the Kotlin, and nothing here can compile the
 * Objective-C at all, so the failure this suite exists for is the one a
 * compiler cannot catch on either side: a method renamed in one language and
 * not the others, an argument added on one side only, or an error code that
 * drifts.
 *
 * It carries three checks its siblings do not, because this package has three
 * things a signature comparison would otherwise miss entirely: the Keychain
 * protection classes (where a missing `ThisDeviceOnly` silently syncs a
 * credential to iCloud), the Android backup exclusion (where a renamed
 * preferences file silently starts being backed up), and the rule that neither
 * native half may log.
 *
 * Deliberately NOT checked here: whether the implementations are *correct*.
 * This suite reads signatures and grep-able facts. `check:android` proves the
 * Kotlin compiles. Whether a keychain item actually survives a reinstall is a
 * device's answer to give.
 */

const PACKAGE_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

const read = (path: string): string => readFileSync(join(PACKAGE_ROOT, path), 'utf-8')

const KOTLIN_DIR = 'android/src/main/java/dev/amritk/minilynx/securestorage'
const KOTLIN = read(`${KOTLIN_DIR}/MiniLynxSecureStorageModule.kt`)
const KOTLIN_RESULTS = read(`${KOTLIN_DIR}/StorageResults.kt`)
const KOTLIN_STORE = read(`${KOTLIN_DIR}/SecureStore.kt`)
const OBJC = read('ios/src/MiniLynxSecureStorageModule.m')
const OBJC_KEYCHAIN = read('ios/src/MiniLynxSecureStorageKeychain.m')
const MANIFEST = read('android/src/main/AndroidManifest.xml')
const BACKUP_RULES = read('android/src/main/res/xml/minilynx_secure_storage_backup_rules.xml')
const EXTRACTION_RULES = read('android/src/main/res/xml/minilynx_secure_storage_data_extraction_rules.xml')

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
  const { module } = createFakeSecureStorage()
  const surface: Surface = new Map()
  for (const [name, value] of Object.entries(module)) {
    if (typeof value === 'function') surface.set(name, value.length)
  }
  return surface
}

/** The facade files that reach the native module. Listed so a new one cannot be silently missed. */
const FACADE_FILES = [
  'clear-secure-storage.ts',
  'get-secure-item.ts',
  'has-secure-item.ts',
  'is-secure-storage-available.ts',
  'remove-secure-item.ts',
  'set-secure-item.ts',
]

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

/** The first number after `name`, wherever it is spelled. */
const numberAfter = (source: string, name: string): number | null => {
  const match = source.match(new RegExp(`${name}\\s*(?::[^=]*)?=\\s*(\\d+)`))
  return match?.[1] === undefined ? null : Number(match[1])
}

describe('native-contract', () => {
  it('finds a method surface in each implementation', () => {
    // A regex that silently matched nothing would make every comparison below
    // pass by agreeing that all three surfaces are empty.
    expect(kotlinSurface().size).toBeGreaterThanOrEqual(6)
    expect(objcSurface().size).toBeGreaterThanOrEqual(6)
    expect(fakeSurface().size).toBeGreaterThanOrEqual(6)
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

  it('registers the module under the same name on both platforms', () => {
    expect(KOTLIN).toContain('@LynxNativeModule(name = "MiniLynxSecureStorageModule")')
    expect(OBJC).toContain('return @"MiniLynxSecureStorageModule";')
  })

  it('points every Objective-C selector at a method that exists', () => {
    // The one failure `pod lib lint` cannot catch either: a selector string in
    // `methodLookup` that names no method is not a build error on iOS, because
    // the string is only resolved when Lynx tries to dispatch through it. It
    // fails at call time, on a device, as a promise that never settles.
    const implemented = new Set([...OBJC.matchAll(/^-\s*\([^)]*\)\s*(\w+)/gm)].map(([, name]) => name as string))

    const selectors = [...OBJC.matchAll(/NSStringFromSelector\(@selector\((\w+)/g)].map(([, name]) => name as string)
    expect(selectors.length).toBeGreaterThanOrEqual(6)

    for (const selector of selectors) {
      expect(implemented.has(selector), `no method implements the selector "${selector}"`).toBe(true)
    }
  })

  it('agrees on the error codes both native sides can report', () => {
    // A code that only one platform can produce is a branch an app writes and
    // never sees fire, and a code the facade does not model arrives as a string
    // no `SecureWriteError` covers.
    for (const error of ['unavailable', 'keystoreFailure', 'tooLarge']) {
      expect(`${KOTLIN}${KOTLIN_RESULTS}`, `Kotlin never reports "${error}"`).toContain(`"${error}"`)
      expect(`${OBJC}${OBJC_KEYCHAIN}`, `Objective-C never reports "${error}"`).toContain(`@"${error}"`)
    }
  })

  it('spells the result payload keys identically in both languages', () => {
    // These are not method names, so nothing above would catch a drift in them
    // — and a result whose `ok` arrived as `okay` would leave every call site
    // taking the failure branch on a perfectly good answer.
    for (const key of ['ok', 'value', 'error', 'message']) {
      expect(KOTLIN_RESULTS, `Kotlin never writes "${key}"`).toContain(`"${key}"`)
      expect(`${OBJC}${OBJC_KEYCHAIN}`, `Objective-C never writes "${key}"`).toContain(`@"${key}"`)
    }
  })

  it('keeps every iOS protection class on ThisDeviceOnly', () => {
    // The single most consequential line in the package, and the one a
    // signature check would never look at: without the `ThisDeviceOnly` suffix
    // a Keychain item is eligible for iCloud Keychain and for encrypted
    // backups, so the credential this package was asked to keep on one device
    // ends up on every device the user owns. Nothing fails, nothing warns, and
    // the app behaves identically.
    expect(OBJC_KEYCHAIN).toContain('kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly')
    expect(OBJC_KEYCHAIN).toContain('kSecAttrAccessibleWhenUnlockedThisDeviceOnly')

    const syncing = OBJC_KEYCHAIN.match(/kSecAttrAccessible(?:WhenUnlocked|AfterFirstUnlock|Always)(?!ThisDeviceOnly)/g)
    expect(syncing, 'a protection class without the ThisDeviceOnly suffix would sync the item').toBeNull()
  })

  it('maps the accessibility vocabulary the TypeScript declares', () => {
    // `afterFirstUnlock` is the default arm on both platforms, so only
    // `whenUnlocked` has to be recognised by name — but the union is what a
    // caller writes, and a third member added to it with no native branch would
    // silently become "whatever the default is".
    const union = read('src/types.ts').match(/export type SecureAccessibility =([^\n]*)/)?.[1] ?? ''
    expect(union).toContain("'whenUnlocked'")
    expect(union).toContain("'afterFirstUnlock'")
    expect(union.match(/'/g)?.length, 'SecureAccessibility has a member no native half maps').toBe(4)
    expect(OBJC_KEYCHAIN).toContain('@"whenUnlocked"')
  })

  it('enforces the same value size cap in all three languages', () => {
    // A cap that differs by platform is a value that stores on one phone and
    // fails on another, discovered by a user.
    expect(numberAfter(KOTLIN_STORE, 'MAX_VALUE_BYTES')).toBe(MAX_VALUE_BYTES)
    expect(numberAfter(OBJC_KEYCHAIN, 'kMiniLynxSecureStorageMaxValueBytes')).toBe(MAX_VALUE_BYTES)
  })

  it('excludes the preferences file the Kotlin actually writes from backup', () => {
    // Three files have to agree on one name, and a rename in the Kotlin alone
    // is completely silent: the store keeps working, and quietly starts being
    // swept into cloud backup and device transfer. What lands on the other
    // device is ciphertext without its Keystore key — undecryptable, which
    // reads to the app as corruption rather than as a signed-out user.
    const file = KOTLIN_STORE.match(/const val FILE = "([^"]+)"/)?.[1]
    expect(file, 'SecureStore no longer names its preferences file').toBeDefined()

    expect(BACKUP_RULES).toContain(`path="${file}.xml"`)
    expect(EXTRACTION_RULES).toContain(`path="${file}.xml"`)
    // Android 12 split the rules in two and reads whichever applies, so a host
    // that only got one of them is unprotected on half its install base.
    expect(MANIFEST).toContain('android:fullBackupContent="@xml/minilynx_secure_storage_backup_rules"')
    expect(MANIFEST).toContain('android:dataExtractionRules="@xml/minilynx_secure_storage_data_extraction_rules"')
    // `device-transfer` is the phone-to-phone copy, and it is the one people
    // leave out because it never touches a cloud.
    expect(EXTRACTION_RULES).toContain('<cloud-backup>')
    expect(EXTRACTION_RULES).toContain('<device-transfer>')
  })

  it('leaves no logging in either native half', () => {
    // Not a style rule. Everything this package handles is a secret, a log line
    // is a file on the device, and the one that prints a token is always
    // written while debugging something else.
    const kotlin = `${KOTLIN}${KOTLIN_RESULTS}${KOTLIN_STORE}`
    expect(kotlin.match(/\bandroid\.util\.Log\b|\bLog\.[dviwe]\(|\bprintln\(/g), 'the Kotlin logs').toBeNull()
    expect(`${OBJC}${OBJC_KEYCHAIN}`.match(/\bNSLog\(|\bos_log\b|\bprintf\(/g), 'the Objective-C logs').toBeNull()
  })
})
