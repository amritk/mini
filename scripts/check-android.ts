/**
 * Compiles every Android library in the repository.
 *
 * This is the only thing in the repository that can tell you the Kotlin is
 * real. Everything else about those packages — the facade, the fake, the parity
 * suite — runs in JavaScript and would pass just as happily against native code
 * that does not compile.
 *
 * It is deliberately **not** part of `bun run test`. It needs an Android SDK,
 * pulls Lynx and AndroidX from the network, and takes minutes on a cold cache;
 * a check with those properties in the default loop is a check people learn to
 * skip. CI runs it on every push instead.
 *
 * Exits 0 with an explanation when there is no SDK, so a contributor without
 * one is told what is being skipped rather than handed a failure they cannot
 * act on. Pass `--require-sdk` (CI does) to turn that into an error.
 */
import { existsSync } from 'node:fs'
import { join } from 'node:path'

import { ROOT, runCommand } from './e2e-helpers'

/**
 * Every package with an Android half, and the Gradle project that compiles it.
 *
 * Each check is its own standalone build rather than one build with two
 * modules, because each `android-check` mirrors what a host app's Gradle sees:
 * one autolinked library, resolving its own plugins. Sharing a build would let
 * one library compile only because the other happened to put something on the
 * classpath — which is exactly the failure a consumer would hit and this could
 * not see.
 */
const CHECKS = [
  { name: '@amritk/lynx-notifications', dir: 'packages/lynx-notifications', project: 'notifications' },
  { name: '@amritk/lynx-location', dir: 'packages/lynx-location', project: 'location' },
  { name: '@amritk/lynx-dialogs', dir: 'packages/lynx-dialogs', project: 'dialogs' },
  { name: '@amritk/lynx-deep-linking', dir: 'packages/lynx-deep-linking', project: 'deeplinking' },
] as const

/** The two spellings the Android tooling accepts, in the order it prefers them. */
const androidHome = (): string | undefined => {
  for (const name of ['ANDROID_HOME', 'ANDROID_SDK_ROOT']) {
    const value = process.env[name]
    if (value && existsSync(value)) return value
  }
  return undefined
}

const main = async (): Promise<void> => {
  const requireSdk = process.argv.includes('--require-sdk')
  const sdk = androidHome()

  if (!sdk) {
    const message =
      'no Android SDK found — set ANDROID_HOME (or ANDROID_SDK_ROOT) to a directory containing platforms/android-35.'
    if (requireSdk) {
      console.error(`check:android failed: ${message}`)
      process.exit(1)
    }
    console.log(`check:android skipped: ${message}`)
    return
  }

  console.log(`check:android using ${sdk}`)

  for (const check of CHECKS) {
    console.log(`check:android compiling ${check.name}`)

    // `assembleRelease` rather than `compileReleaseKotlin`: it additionally
    // merges the AndroidManifest and verifies resources, which is where each
    // library's receivers, activities, provider and queries are — and a
    // manifest that does not merge is exactly as broken as Kotlin that does not
    // compile.
    const { stdout, stderr } = await runCommand(
      'gradle',
      ['--console=plain', '--no-daemon', `:${check.project}:assembleRelease`],
      {
        cwd: join(ROOT, check.dir, 'android-check'),
        env: { ...process.env, ANDROID_HOME: sdk },
        maxBuffer: 32 * 1024 * 1024,
      },
    )

    const output = `${stdout}\n${stderr}`
    // Kotlin reports warnings on stdout and keeps going. A deprecation in these
    // libraries is worth failing on: the code is unverifiable on a device from
    // here, so a compiler telling us something is wrong is a signal we cannot
    // afford to let scroll past.
    const warnings = output.split('\n').filter((line) => line.startsWith('w: ') && line.includes(`/${check.dir}/`))

    if (warnings.length > 0) {
      console.error(`check:android failed: ${check.name} compiled with warnings\n`)
      for (const warning of warnings) console.error(warning)
      process.exit(1)
    }
  }

  console.log('check:android passed: every Android library compiles and packages')
}

await main()
