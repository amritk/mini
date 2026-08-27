#!/usr/bin/env node
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { DEFAULT_NAME, scaffold } from './scaffold'

/**
 * The command behind `bun create @amritk/mini-lynx my-app`.
 *
 * Everything that touches the filesystem is in `scaffold.ts`; this file is
 * argument parsing, the package-manager install, and the output — the three
 * parts that need a terminal. It has no dependencies, which is the point: a
 * scaffolder that installs a dependency tree of its own before writing a single
 * file is the slowest step in the experience it exists to make fast.
 */

export type PackageManager = 'bun' | 'npm' | 'pnpm' | 'yarn'

export type CliOptions = {
  /** Where to write the app, relative to the working directory. */
  directory: string
  /** Run the package manager's install afterwards. `--no-install` turns it off. */
  install: boolean
  /** Start the dev server once the install is done. `--start` turns it on. */
  start: boolean
  packageManager: PackageManager
  help: boolean
  version: boolean
}

const PACKAGE_MANAGERS: readonly PackageManager[] = ['bun', 'npm', 'pnpm', 'yarn']

/**
 * Which package manager ran us.
 *
 * `npm_config_user_agent` is set by every one of them and is the only signal
 * that survives `npm create` / `bun create` re-invoking this package — the
 * binary on `PATH` says nothing about which manager the user chose. Bun is the
 * fallback when we are running under its own runtime, npm otherwise, because an
 * npm-shaped install command is the one every machine can run.
 */
export const detectPackageManager = (userAgent: string | undefined): PackageManager => {
  const name = userAgent?.split('/')[0]
  const known = PACKAGE_MANAGERS.find((candidate) => candidate === name)
  if (known) return known
  return process.versions['bun'] === undefined ? 'npm' : 'bun'
}

/**
 * Parses `argv` — the arguments after the command itself.
 *
 * A hand-rolled parser rather than `node:util`'s `parseArgs` so the errors can
 * name the flag the way the help text spells it, and so a stray `--pm` with no
 * value fails here instead of silently taking the directory as its argument.
 */
export const parseArgs = (argv: readonly string[], userAgent?: string): CliOptions => {
  const options: CliOptions = {
    directory: '',
    install: true,
    start: false,
    packageManager: detectPackageManager(userAgent),
    help: false,
    version: false,
  }
  const positional: string[] = []
  let refusedInstall = false

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index] ?? ''
    if (argument === '--help' || argument === '-h') options.help = true
    else if (argument === '--version' || argument === '-v') options.version = true
    else if (argument === '--no-install') {
      options.install = false
      refusedInstall = true
    } else if (argument === '--install') options.install = true
    else if (argument === '--start') options.start = true
    else if (argument === '--pm' || argument.startsWith('--pm=')) {
      const value = argument.startsWith('--pm=') ? argument.slice('--pm='.length) : argv[++index]
      const manager = PACKAGE_MANAGERS.find((candidate) => candidate === value)
      if (!manager) throw new Error(`--pm takes one of ${PACKAGE_MANAGERS.join(', ')}, not "${value ?? ''}".`)
      options.packageManager = manager
    } else if (argument.startsWith('-')) throw new Error(`Unknown option "${argument}".`)
    else positional.push(argument)
  }

  // Refusing beats ignoring one of the two: a dev server started against a
  // directory with no node_modules in it fails several seconds later, in vite's
  // words rather than ours.
  if (options.start && refusedInstall) throw new Error('--start needs the install; drop --no-install.')
  if (positional.length > 1) throw new Error(`Expected one directory, got ${positional.length}.`)
  options.directory = positional[0] ?? DEFAULT_NAME
  return options
}

/** This package's own version, read from the manifest beside `dist/`. */
const version = (): string => {
  const manifest = join(dirname(fileURLToPath(import.meta.url)), '..', 'package.json')
  return (JSON.parse(readFileSync(manifest, 'utf-8')) as { version?: string }).version ?? '0.0.0'
}

const HELP = `create-mini-lynx — a @amritk/mini-lynx app, running in a device preview

Usage
  bun create @amritk/mini-lynx <directory> [options]
  npm create @amritk/mini-lynx@latest <directory> -- [options]

Options
  --pm <bun|npm|pnpm|yarn>  Which package manager installs (default: the one running this)
  --no-install              Write the files and stop
  --start                   Boot the dev server when the install finishes
  -h, --help                Show this
  -v, --version             Print the version
`

/** Runs a package-manager command in the new app, returning whether it succeeded. */
const run = (command: string, args: string[], cwd: string): boolean => {
  // `shell` on Windows because npm, pnpm and yarn are all `.cmd` shims there,
  // which `spawnSync` will not execute directly.
  const { status, error } = spawnSync(command, args, { cwd, stdio: 'inherit', shell: process.platform === 'win32' })
  return error === undefined && status === 0
}

export const main = async (
  argv: readonly string[],
  userAgent = process.env['npm_config_user_agent'],
): Promise<number> => {
  let options: CliOptions
  try {
    options = parseArgs(argv, userAgent)
  } catch (error) {
    console.error(`${error instanceof Error ? error.message : String(error)}\n\n${HELP}`)
    return 1
  }

  if (options.help) {
    console.log(HELP)
    return 0
  }
  if (options.version) {
    console.log(version())
    return 0
  }

  const target = resolve(process.cwd(), options.directory)
  let created: Awaited<ReturnType<typeof scaffold>>
  try {
    created = await scaffold({ directory: target })
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    return 1
  }

  console.log(`Created ${created.name} in ${options.directory} (${created.files.length} files)`)

  const pm = options.packageManager
  // Only the install is worth surviving on its own: a machine with no network,
  // or a manager not on PATH, still gets the app and the two lines that finish
  // it. Failing the whole command there would delete nothing and help nobody.
  const installed = options.install && run(pm, ['install'], target)
  if (options.install && !installed)
    console.log(`\n${pm} install did not finish — run it yourself in ${options.directory}.`)

  if (options.start && installed) {
    console.log(
      `\nStarting the dev server. The preview is a browser standing in for a device — README.md says what that can and cannot show you.\n`,
    )
    run(pm, ['run', 'dev'], target)
    return 0
  }

  console.log(
    [
      '',
      'Next:',
      `  cd ${options.directory}`,
      ...(installed ? [] : [`  ${pm} install`]),
      `  ${pm} run dev`,
      '',
      'That serves the app in a device frame, running on a browser implementation',
      "of Lynx's Element PAPI. README.md is honest about what it cannot show you.",
      '',
    ].join('\n'),
  )
  return 0
}

// Only when this file IS the command. `scripts/dist-smoke.test.ts` imports every
// built module to prove it loads, and a CLI that scaffolds on import would write
// an app into whatever directory that test happened to run in.
if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await main(process.argv.slice(2))
}
