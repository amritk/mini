import { cp, mkdir, readdir, readFile, rename, writeFile } from 'node:fs/promises'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * The scaffolder: a template directory copied to a target, with the two edits a
 * copy cannot make for itself.
 *
 * It is a plain async function taking a directory rather than anything that
 * reads `process.argv` or writes to a console, so the CLI is a thin wrapper and
 * the interesting part is testable without a subprocess. `cli.ts` owns argument
 * parsing, the package-manager install and every line of output; nothing here
 * prints.
 */

export type ScaffoldOptions = {
  /** Where to write the app. Created if it does not exist; must be empty if it does. */
  directory: string
  /**
   * The `name` written into the app's `package.json`. Defaults to the target
   * directory's own name, run through `toPackageName`.
   */
  name?: string
  /** The template to copy. Defaults to the one this package ships. */
  templateDirectory?: string
}

export type ScaffoldResult = {
  /** The absolute path written to. */
  directory: string
  /** The name that ended up in `package.json`. */
  name: string
  /** Every file created, relative to `directory`, sorted. */
  files: string[]
}

/**
 * Files npm will not put in a tarball under their real names, stored under a
 * placeholder and renamed on the way out.
 *
 * `.gitignore` is the one that bites: npm *renames* it to `.npmignore` inside a
 * published package, so a template that stores one ships without it and every
 * scaffolded app commits its own `node_modules`. Storing it as `_gitignore` is
 * the standard workaround, and it has to be undone here.
 */
const RENAMED_ON_WRITE: Readonly<Record<string, string>> = {
  _gitignore: '.gitignore',
  _npmrc: '.npmrc',
}

/** The template this package ships, resolved relative to the built module. */
export const templateDirectory = (): string => resolve(dirname(fileURLToPath(import.meta.url)), '..', 'template')

/**
 * A directory name → something npm will accept as a package name.
 *
 * Scoped names are kept whole (`@acme/app` is valid), a leading dot or
 * underscore is dropped because npm reserves both, and anything else outside
 * npm's grammar becomes a hyphen. An empty result — `.`, `../`, a directory of
 * punctuation — falls back to the default name rather than writing a manifest
 * npm would reject.
 */
export const toPackageName = (raw: string): string => {
  const scoped = raw.startsWith('@') && raw.includes('/')
  const cleaned = raw
    .toLowerCase()
    .replace(/[^a-z0-9-._~/@]+/g, '-')
    .replace(/^[._]+/, '')
    .replace(/^-+|-+$/g, '')
  if (cleaned.length === 0 || (!scoped && cleaned.includes('/'))) return DEFAULT_NAME
  return cleaned
}

/** What an app is called when the target directory cannot supply a usable name. */
export const DEFAULT_NAME = 'mini-lynx-app'

/**
 * Writes the app. Throws — rather than merging — when the target is a
 * non-empty directory, because a scaffolder that half-overwrites someone's work
 * is worse than one that refuses.
 */
export const scaffold = async (options: ScaffoldOptions): Promise<ScaffoldResult> => {
  const directory = resolve(options.directory)
  const template = options.templateDirectory ?? templateDirectory()

  const existing = await readdir(directory).catch(() => null)
  if (existing !== null && existing.length > 0) {
    throw new Error(`${directory} is not empty. Pick a different directory, or empty this one first.`)
  }

  await mkdir(directory, { recursive: true })
  await cp(template, directory, { recursive: true })

  for (const [stored, real] of Object.entries(RENAMED_ON_WRITE)) {
    await rename(join(directory, stored), join(directory, real)).catch(() => {})
  }

  const name = options.name ?? toPackageName(basename(directory))
  await writeName(join(directory, 'package.json'), name)

  return { directory, name, files: await listFiles(directory) }
}

/**
 * Rewrites the manifest's `name` in place, through JSON rather than a string
 * substitution: the template is a real, installable app in its own right, so
 * there is no placeholder token to swap and nothing to go stale.
 */
const writeName = async (manifestPath: string, name: string): Promise<void> => {
  const manifest = JSON.parse(await readFile(manifestPath, 'utf-8')) as Record<string, unknown>
  manifest['name'] = name
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf-8')
}

/** Every file under `directory`, relative and sorted, so a caller can report or assert on it. */
const listFiles = async (directory: string): Promise<string[]> => {
  const entries = await readdir(directory, { recursive: true, withFileTypes: true })
  return entries
    .filter((entry) => entry.isFile())
    .map((entry) => join(entry.parentPath, entry.name).slice(directory.length + 1))
    .sort()
}
