/// <reference types="node" />
// This test walks the source tree, so it needs Node's fs/path/url — pulled in
// explicitly here because the package's tsconfig is deliberately platform-free
// (`lib: ["ESNext"]`, `types: []`) to keep the shipped sources off both the DOM
// and the Node ambient types.
import { existsSync, readFileSync, statSync } from 'node:fs'
import { dirname, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * The package's central claim, enforced: the core carries no platform.
 *
 * The `.` entry's transitive import graph must contain ONLY this package's own
 * core sources and `alien-signals`. Every subpath is opt-in — `flow/`,
 * `composition/`, `router/`, `forms/`, `query/` — and an app that uses none of
 * them should not carry their bytes.
 *
 * `testing/` is on that list and is the one worth naming, because it is the one
 * that would be embarrassing: the fake engine exists to be imported BY a test,
 * and a reference implementation of the whole Element PAPI reaching a device
 * bundle through the `.` entry would be dead weight an app cannot even see.
 *
 * The tsconfig's missing DOM lib catches a stray `document`, but it is perfectly
 * happy with an import that merely drags a subpath's bytes along. This walks the
 * source graph from `src/index.ts` and fails the moment anything else appears.
 */

const SRC = fileURLToPath(new URL('.', import.meta.url))

/** The subpath directories — none of these may be reachable from `.`. */
const SUBPATH_DIRS = ['flow', 'composition', 'router', 'forms', 'query', 'testing']

/**
 * Drops comments before the specifiers are read.
 *
 * This package documents itself with realistic `@example` blocks, and several
 * of them open with `import … from '@amritk/mini-lynx/hosts/dom'`. Those are
 * documentation, not dependencies, and counting them would report a host leak
 * in a file that imports nothing of the sort. Line comments are matched only
 * when they start a line, so a `https://` inside a string survives.
 */
const withoutComments = (source: string): string => source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

/** Extracts every import/export module specifier from a source file. */
const specifiersOf = (file: string): string[] => {
  const source = withoutComments(readFileSync(file, 'utf-8'))
  const specifiers: string[] = []
  // `import ... from '...'` and `export ... from '...'` (covers type-only too).
  const fromRe = /(?:import|export)\b[^'"]*?\bfrom\s*['"]([^'"]+)['"]/g
  // Bare side-effect imports: `import '...'`.
  const bareRe = /\bimport\s*['"]([^'"]+)['"]/g
  for (const match of source.matchAll(fromRe)) specifiers.push(match[1] as string)
  for (const match of source.matchAll(bareRe)) specifiers.push(match[1] as string)
  return specifiers
}

/**
 * Resolves a relative specifier to a concrete `.ts`/`.tsx` FILE on disk.
 *
 * The extensioned candidates are tried before the bare path, and the bare path
 * is accepted only when it is a file. Otherwise `'./vocabulary'` resolves to the
 * directory of that name — which exists — and the walker then tries to read a
 * directory as text, which fails with an `EISDIR` that says nothing about what
 * went wrong.
 */
const resolveRelative = (fromFile: string, specifier: string): string | null => {
  const base = resolve(dirname(fromFile), specifier)
  for (const candidate of [`${base}.ts`, `${base}.tsx`, `${base}/index.ts`, `${base}/index.tsx`, base]) {
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate
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

/** The graph files that live under one of the forbidden directories, named so a failure points at the culprit. */
const leaksFrom = (files: Set<string>, dirs: readonly string[]): string[] =>
  [...files].map((file) => relative(SRC, file)).filter((path) => dirs.some((dir) => path.startsWith(`${dir}/`)))

describe('import-boundary', () => {
  const { files, externals } = walk(resolve(SRC, 'index.ts'))

  it('pulls in only alien-signals and a types-only peer', () => {
    // `@lynx-js/types` is the one addition, and it costs a bundle nothing:
    // the package ships `.d.ts` files and no runtime at all, so every import
    // of it in this graph is `import type` and erases at compile time. It is
    // listed rather than filtered out so that the day it grows a runtime — or
    // the day someone writes a value import of it — this fails instead of
    // quietly shipping it.
    expect([...externals].sort()).toEqual(['@lynx-js/types', 'alien-signals'])
  })

  it('imports the types-only peer with `import type` and nothing else', () => {
    // The assertion above is only as good as this one: a value import of a
    // types-only package resolves to nothing at runtime and fails on a device
    // rather than at the boundary.
    const offenders = [...files].filter((file) => {
      const source = withoutComments(readFileSync(file, 'utf-8'))
      return /(?:^|\n)\s*import\s+(?!type\b)[^\n]*from\s*['"]@lynx-js\/types/.test(source)
    })
    expect(offenders.map((file) => relative(SRC, file))).toEqual([])
  })

  it('never reaches an opt-in subpath from the core entry', () => {
    // The leak that would be embarrassing is `testing/`: the fake engine is a
    // reference implementation of the whole Element PAPI, and reaching a device
    // bundle through the `.` entry would be dead weight an app cannot even see.
    expect(leaksFrom(files, SUBPATH_DIRS)).toEqual([])
  })

  it('never imports one of its own subpaths by package name', () => {
    // A `@amritk/mini-lynx/<name>` import would re-enter the package graph
    // through the exports map and defeat tree-shaking; core must reference its
    // siblings by relative path only.
    const subpathImports = [...externals].filter((name) => name.startsWith('@amritk/mini-lynx'))
    expect(subpathImports).toEqual([])
  })

  it('keeps the control-flow subpath on the core alone', () => {
    // `/flow` is as platform-free as core is, and for the same reason: the
    // components reach the tree through the installed engine rather than
    // through anything concrete.
    const flow = walk(resolve(SRC, 'flow', 'index.ts'))
    expect(
      leaksFrom(
        flow.files,
        SUBPATH_DIRS.filter((dir) => dir !== 'flow'),
      ),
    ).toEqual([])
    expect([...flow.externals].sort()).toEqual(['@lynx-js/types', 'alien-signals'])
  })

  it('keeps the peer-backed subpaths off the core budget', () => {
    // `/forms` and `/query` are the two entries with an optional peer, and the
    // whole point of the peer being optional is that an app importing neither
    // installs neither. That only holds while nothing in core reaches them.
    for (const subpath of ['forms', 'query']) {
      expect(leaksFrom(files, [subpath])).toEqual([])
    }
  })
})
