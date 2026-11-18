import { existsSync } from 'node:fs'
import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { beforeAll, describe, expect, it } from 'vitest'

import { ROOT, runNode } from './e2e-helpers'

/**
 * Smoke test for the compiled `dist/` artifacts — the exact files that ship to
 * npm. The regular test suite aliases the package to its `src/`, so nothing
 * there can catch a build step corrupting the output: the sources can be
 * perfect while `tsgo`, `tsc-alias`, or the comment-stripping pass emits
 * something Node cannot load. Everything here runs under plain `node` (no Bun,
 * no aliases) for that reason.
 *
 * Requires a prior `bun run build`; run via `bun run test:dist`.
 */

type PackageJson = { name?: string; exports?: Record<string, unknown> }

const DIST = join(ROOT, 'dist')

/** Every `./dist/...` target declared by the exports map, as absolute paths. */
const declaredEntries = (pkg: PackageJson): string[] => {
  const targets: string[] = []
  const walk = (node: unknown): void => {
    if (typeof node === 'string') {
      // `./package.json` is data, not a module to resolve.
      if (node.startsWith('./dist/')) targets.push(join(ROOT, node))
      return
    }
    if (node === null || typeof node !== 'object') return
    for (const value of Object.values(node as Record<string, unknown>)) walk(value)
  }
  walk(pkg.exports ?? {})
  return [...new Set(targets)]
}

describe('dist-smoke', () => {
  let pkg: PackageJson

  beforeAll(async () => {
    if (!existsSync(DIST)) throw new Error('no dist/ directory — run `bun run build` before `bun run test:dist`.')
    pkg = JSON.parse(await readFile(join(ROOT, 'package.json'), 'utf-8')) as PackageJson
  })

  it('every compiled module loads under Node ESM', async () => {
    const modules = (await readdir(DIST, { recursive: true }))
      .filter((file) => file.endsWith('.js'))
      .map((file) => join(DIST, file))

    // Guard against this sweep silently going dark (say, a dist layout change
    // leaving it with nothing to check) by requiring a meaningful surface.
    expect(modules.length).toBeGreaterThan(20)

    // One child process imports every module. A SyntaxError anywhere in dist —
    // or a relative import Node cannot resolve, e.g. a missing .js extension —
    // fails here with the offending file named.
    const loader = `
      const failures = []
      for (const file of ${JSON.stringify(modules.map((file) => pathToFileURL(file).href))}) {
        try {
          await import(file)
        } catch (error) {
          failures.push(file + '\\n  ' + error.message)
        }
      }
      if (failures.length > 0) {
        console.error(failures.join('\\n'))
        process.exit(1)
      }
    `
    await runNode(['--input-type=module', '-e', loader])
  })

  it('every declared export target exists in dist', () => {
    const entries = declaredEntries(pkg)
    // An empty list would mean the walk stopped finding targets rather than
    // that everything is present.
    expect(entries.length).toBeGreaterThan(10)
    // `types` entries point at .d.ts files, which must ship too.
    expect(entries.filter((entry) => !existsSync(entry))).toEqual([])
  })
})
