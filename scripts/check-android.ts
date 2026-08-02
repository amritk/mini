/**
 * Compiles `@amritk/mini-lynx-notifications`' Android library.
 *
 * This is the only thing in the repository that can tell you the Kotlin is
 * real. Everything else about that package — the facade, the fake, the parity
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

const CHECK_DIR = join(ROOT, 'packages/mini-lynx-notifications/android-check')

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

  // `assembleRelease` rather than `compileReleaseKotlin`: it additionally merges
  // the AndroidManifest and verifies resources, which is where the library's
  // receivers, activity and intent filters are — and a manifest that does not
  // merge is exactly as broken as Kotlin that does not compile.
  const { stdout, stderr } = await runCommand(
    'gradle',
    ['--console=plain', '--no-daemon', ':notifications:assembleRelease'],
    { cwd: CHECK_DIR, env: { ...process.env, ANDROID_HOME: sdk }, maxBuffer: 32 * 1024 * 1024 },
  )

  const output = `${stdout}\n${stderr}`
  // Kotlin reports warnings on stdout and keeps going. A deprecation in this
  // library is worth failing on: the code is unverifiable on a device from
  // here, so a compiler telling us something is wrong is a signal we cannot
  // afford to let scroll past.
  const warnings = output
    .split('\n')
    .filter((line) => line.startsWith('w: ') && line.includes('/mini-lynx-notifications/'))

  if (warnings.length > 0) {
    console.error('check:android failed: the Kotlin compiled with warnings\n')
    for (const warning of warnings) console.error(warning)
    process.exit(1)
  }

  console.log('check:android passed: the Android library compiles and packages')
}

await main()
