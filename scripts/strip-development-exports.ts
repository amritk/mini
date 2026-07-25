import { readdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

type Exports = Record<string, unknown>
type PackageJson = { name?: string; exports?: Exports }

/**
 * Recursively deletes every `development` condition within an exports subtree.
 * Returns true when something was removed, so a manifest that is already clean
 * is left untouched on disk.
 */
export const stripDevelopment = (node: unknown): boolean => {
  if (node === null || typeof node !== 'object') return false
  let changed = false
  const conditions = node as Record<string, unknown>
  if ('development' in conditions) {
    delete conditions.development
    changed = true
  }
  for (const value of Object.values(conditions)) {
    if (stripDevelopment(value)) changed = true
  }
  return changed
}

/**
 * Strips the `development` condition from every workspace package's `exports`.
 *
 * Locally we resolve packages to their TypeScript source via the `development`
 * export condition (see `--conditions development` and the src aliases in
 * vitest.config.ts). That condition points at `./src/*.ts`, and both packages
 * deliberately ship `src` in their `files` list — so a consumer or bundler
 * resolving `development` against a published tarball finds real files and
 * pulls in raw, untranspiled TypeScript instead of the built JS in `dist`.
 *
 * Removing the condition from the published manifests closes that hole. Like
 * resolve-workspace-protocol and copy-license, this runs in the ephemeral
 * publish job and is never committed.
 *
 * Returns the names of the packages whose manifests were rewritten.
 */
export const stripDevelopmentExports = async (root: string): Promise<string[]> => {
  const packagesDir = join(root, 'packages')
  const stripped: string[] = []

  for (const entry of await readdir(packagesDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const path = join(packagesDir, entry.name, 'package.json')
    const pkg = JSON.parse(await readFile(path, 'utf-8')) as PackageJson
    if (!pkg.exports) continue

    if (stripDevelopment(pkg.exports)) {
      await writeFile(path, `${JSON.stringify(pkg, null, 2)}\n`, 'utf-8')
      stripped.push(pkg.name ?? entry.name)
    }
  }

  return stripped
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  stripDevelopmentExports(join(import.meta.dir, '..'))
    .then((stripped) => {
      for (const name of stripped) console.log(`Stripped development exports in ${name}`)
    })
    .catch((error: unknown) => {
      console.error(error instanceof Error ? error.message : error)
      process.exit(1)
    })
}
