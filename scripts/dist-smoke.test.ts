import { existsSync } from 'node:fs'
import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { describe, expect, it } from 'vitest'

import { ROOT, runNode } from './e2e-helpers'

/**
 * Smoke test for the compiled `dist/` artifacts — the exact files that ship to
 * npm. The regular test suite aliases both packages to their `src/`, so nothing
 * there can catch a build step corrupting the output: the sources can be
 * perfect while `tsgo`, `tsc-alias`, or the comment-stripping pass emits
 * something Node cannot load. Everything here runs under plain `node` (no Bun,
 * no aliases, no `development` export condition) for that reason.
 *
 * Requires a prior `bun run build`; run via `bun run test:dist`.
 */

type PackageJson = {
  name?: string
  private?: boolean
  exports?: Record<string, unknown>
}

const PACKAGES_DIR = join(ROOT, 'packages')

const readManifest = async (dir: string): Promise<PackageJson> =>
  JSON.parse(await readFile(join(PACKAGES_DIR, dir, 'package.json'), 'utf-8')) as PackageJson

/** The publishable workspace packages, each paired with its manifest. */
const publishedPackages = async (): Promise<{ dir: string; pkg: PackageJson }[]> => {
  const found: { dir: string; pkg: PackageJson }[] = []
  for (const entry of await readdir(PACKAGES_DIR, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const pkg = await readManifest(entry.name)
    if (pkg.private) continue
    found.push({ dir: entry.name, pkg })
  }
  return found
}

/** Every compiled `.js` module shipped by the publishable packages. */
const collectDistModules = async (): Promise<string[]> => {
  const modules: string[] = []

  for (const { dir, pkg } of await publishedPackages()) {
    const distDir = join(PACKAGES_DIR, dir, 'dist')
    if (!existsSync(distDir)) {
      throw new Error(`${pkg.name} has no dist/ directory — run \`bun run build\` before \`bun run test:dist\`.`)
    }
    for (const file of await readdir(distDir, { recursive: true })) {
      if (file.endsWith('.js')) modules.push(join(distDir, file))
    }
  }

  return modules
}

/** Every `import`/`default` target declared by a package's `exports` map. */
const declaredEntries = (pkg: PackageJson, dir: string): string[] => {
  const targets: string[] = []
  const walk = (node: unknown): void => {
    if (typeof node === 'string') {
      // The `development` condition points at src/ and is stripped at publish
      // time; package.json itself is not a module to resolve.
      if (node.startsWith('./dist/')) targets.push(join(PACKAGES_DIR, dir, node))
      return
    }
    if (node === null || typeof node !== 'object') return
    for (const value of Object.values(node as Record<string, unknown>)) walk(value)
  }
  walk(pkg.exports ?? {})
  return [...new Set(targets)]
}

describe('dist-smoke', () => {
  it('every compiled module loads under Node ESM', async () => {
    const modules = await collectDistModules()

    // Guard against this sweep silently going dark (say, a dist layout change
    // leaving it with nothing to check) by requiring a meaningful surface.
    expect(modules.length).toBeGreaterThan(20)

    // One child process imports every module. A SyntaxError anywhere in dist —
    // or a relative import Node cannot resolve, e.g. a missing .js extension —
    // fails here with the offending file named.
    const loader = `
      const failures = []
      for (const file of ${JSON.stringify(modules)}) {
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

  it('every declared export subpath exists in dist', async () => {
    const missing: string[] = []
    for (const { dir, pkg } of await publishedPackages()) {
      const entries = declaredEntries(pkg, dir)
      // Both packages publish a broad export map; an empty list would mean the
      // walk stopped finding targets rather than that everything is present.
      expect(entries.length, `${pkg.name} declares dist export targets`).toBeGreaterThan(0)
      for (const entry of entries) {
        // `types` entries point at .d.ts files, which must ship too.
        if (!existsSync(entry)) missing.push(entry)
      }
    }
    expect(missing).toEqual([])
  })

  it('the built mini-native reorders a keyed list through the memory host', async () => {
    // A real end-to-end exercise of the compiled artifacts: mount's scope
    // ownership, the host indirection, the keyed reconciler, the text binding,
    // and the signals re-export all have to survive the build for this to
    // produce the right tree. The memory host involves no platform at all, so
    // it runs under plain Node exactly as shipped.
    const nativeDist = pathToFileURL(join(PACKAGES_DIR, 'mini-native/dist')).href
    const script = `
      const { bindText, list, mount, setHost, signal } = await import('${nativeDist}/index.js')
      const { createMemoryHost } = await import('${nativeDist}/hosts/create-memory-host.js')
      const { serializeMemoryTree } = await import('${nativeDist}/hosts/serialize-memory-tree.js')

      const memory = createMemoryHost()
      setHost(memory.host)

      const first = signal('first')
      const rows = signal([{ id: 'a', label: first }, { id: 'b', label: signal('second') }])

      mount(memory.rootElement, () => {
        const container = memory.host.createElement('view')
        list(container, rows, (row) => row.id, (row) => {
          const item = memory.host.createElement('text')
          const text = memory.host.createText('')
          bindText(text, () => row.label())
          memory.host.insert(item, text, null)
          return item
        })
        return container
      })

      const labels = () => [...serializeMemoryTree(memory.root).matchAll(/"([^"]*)"/g)].map((m) => m[1]).join(',')
      const check = (expected) => {
        if (labels() !== expected) {
          console.error('expected ' + expected + ', got ' + labels() + '\\n' + serializeMemoryTree(memory.root))
          process.exit(1)
        }
      }

      check('first,second')

      // A keyed move: the reconciler reuses both rows in the new order rather
      // than rebuilding them.
      rows([{ id: 'b', label: rows()[1].label }, { id: 'a', label: first }])
      check('second,first')

      // And the moved row's binding is still live. This is the half that used
      // to break: row scopes built inside the reconciliation effect were
      // disposed the moment the collection changed, leaving the nodes on screen
      // looking correct while every binding had quietly stopped updating.
      first('renamed')
      check('second,renamed')
    `
    await runNode(['--input-type=module', '-e', script])
  })
})
