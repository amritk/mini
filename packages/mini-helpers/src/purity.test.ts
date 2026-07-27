/// <reference types="node" />
// This test walks the source tree, so it needs Node's fs/path/url — pulled in
// explicitly here because the package's tsconfig is deliberately platform-free
// (`lib: ["ESNext"]`, `types: []`) to keep the shipped sources off both the DOM
// and the Node ambient types.
import { existsSync, readFileSync } from 'node:fs'
import { dirname, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * This package's charter, enforced: what lives here is pure, and pure means two
 * specific things.
 *
 * **No reactivity.** `alien-signals` must not appear anywhere in either entry's
 * graph. This is the load-bearing one. Both sibling packages import the signal
 * engine through exactly one module of their own (`src/signals.ts`) so there is
 * a single copy per package; a third package reaching for it would create a
 * third edge, and a consumer whose installer satisfied that edge separately
 * would end up with two signal graphs. An effect created through `@amritk/mini`
 * would never see a write made through this package — a failure that
 * typechecks, runs, and simply stops updating. Keeping signals out entirely
 * makes it unrepresentable rather than merely unlikely.
 *
 * **No platform.** The tsconfig already withholds `lib.dom` and Node's ambient
 * types, so a stray `document` or `process` fails `types:check`. What that
 * cannot see is an import that drags a platform in by package name, which is
 * what the externals assertions below pin.
 *
 * The `.` entry additionally has NO dependencies at all — that is the promise
 * it makes, and it is why the one helper with a peer sits on `/schema`.
 */

const SRC = fileURLToPath(new URL('.', import.meta.url))

/** Extracts every import/export module specifier from a source file. */
const specifiersOf = (file: string): string[] => {
  const source = readFileSync(file, 'utf-8')
  const specifiers: string[] = []
  // `import ... from '...'` and `export ... from '...'` (covers type-only too).
  const fromRe = /(?:import|export)\b[^'"]*?\bfrom\s*['"]([^'"]+)['"]/g
  // Bare side-effect imports: `import '...'`.
  const bareRe = /\bimport\s*['"]([^'"]+)['"]/g
  for (const match of source.matchAll(fromRe)) specifiers.push(match[1] as string)
  for (const match of source.matchAll(bareRe)) specifiers.push(match[1] as string)
  return specifiers
}

/** Resolves a relative specifier to a concrete `.ts` file on disk. */
const resolveRelative = (fromFile: string, specifier: string): string | null => {
  const base = resolve(dirname(fromFile), specifier)
  for (const candidate of [base, `${base}.ts`, `${base}/index.ts`]) {
    if (existsSync(candidate)) return candidate
  }
  return null
}

/** Walks the transitive graph from `entry`, collecting visited files and external packages. */
const walk = (entry: string): { files: Set<string>; externals: Set<string> } => {
  const files = new Set<string>()
  const externals = new Set<string>()
  const queue = [entry]
  while (queue.length > 0) {
    const file = queue.pop() as string
    if (files.has(file)) continue
    files.add(file)
    for (const specifier of specifiersOf(file)) {
      if (specifier.startsWith('.')) {
        const resolved = resolveRelative(file, specifier)
        // A type-only import that strips at build time still counts as a source
        // dependency here; an unresolved path is a real problem to surface.
        expect(resolved, `${specifier} from ${relative(SRC, file)} should resolve`).not.toBeNull()
        if (resolved) queue.push(resolved)
      } else {
        externals.add(specifier)
      }
    }
  }
  return { files, externals }
}

describe('purity', () => {
  const root = walk(resolve(SRC, 'index.ts'))
  const schema = walk(resolve(SRC, 'schema', 'index.ts'))

  it('gives the main entry no dependencies at all', () => {
    // Route matching and query parsing are string arithmetic. If this list ever
    // stops being empty, the thing that was added does not belong on `.`.
    expect([...root.externals]).toEqual([])
  })

  it('gives the schema entry nothing but its optional peer', () => {
    // Listed rather than waved through, so a dependency added later has to be a
    // deliberate edit to this line.
    expect([...schema.externals].sort()).toEqual(['@amritk/runtime-validators'])
  })

  it('never reaches the signal engine from any entry', () => {
    // The rule the whole package exists under. Covered by the two assertions
    // above today, and stated separately anyway: those pin what IS allowed and
    // would be relaxed by anyone adding a legitimate dependency, whereas this
    // one is never relaxed.
    for (const { externals } of [root, schema]) {
      expect([...externals].filter((name) => name.startsWith('alien-signals'))).toEqual([])
    }
  })

  it('never imports either sibling package', () => {
    // Shared code is a leaf. An import back into `@amritk/mini` or
    // `@amritk/mini-native` would turn the two siblings into a cycle through
    // this package and quietly make each one depend on the other.
    for (const { externals } of [root, schema]) {
      expect([...externals].filter((name) => name.startsWith('@amritk/mini'))).toEqual([])
    }
  })

  it('keeps the schema entry out of the main entry graph', () => {
    // `.` promises it resolves with nothing installed but itself, and it can
    // only keep that promise while the peer-backed helper stays unreachable
    // from it.
    const leaked = [...root.files].map((file) => relative(SRC, file)).filter((path) => path.startsWith('schema/'))
    expect(leaked).toEqual([])
  })
})
