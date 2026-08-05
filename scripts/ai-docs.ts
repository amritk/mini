/**
 * The structural contract every package's `AI.md` keeps — the logic behind
 * `scripts/check-ai-docs.ts` (a CI gate) and `scripts/ai-docs.test.ts`.
 *
 * `llms.txt` / `llms-full.txt` are regenerated and diffed in CI, which catches
 * a stale *bundle* but not a stale *source*: an `AI.md` that never mentions the
 * subpath or the function a release added regenerates perfectly and still lies
 * to the only audience that cannot file an issue about it. This is the guard
 * for that — it reads what a package actually exports and asks whether its
 * `AI.md` says so.
 *
 * Kept side-effect-free so the test can exercise the same code the gate runs
 * against fixtures instead of the working tree.
 */

import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * One `exports` entry. A bare string for `./package.json`-style passthroughs,
 * otherwise the condition map, whose `import`/`default` name the built module.
 */
export type ExportTarget = string | { import?: string; default?: string }

/**
 * The source file a `./dist/` export target was built from.
 *
 * The exports maps used to carry a `development` condition naming the source
 * outright, and this read it. That condition is gone — it pointed at `./src/*.ts`
 * inside a tarball that ships `src`, so anything honouring it got raw TypeScript
 * — and the mapping replaces it. It holds because every package builds with
 * `rootDir: "src"` and `outDir: "dist"`, which is what makes `dist/x/index.js`
 * and `src/x/index.ts` the same module by construction.
 *
 * Returns null for an entry with no dist target, so the caller can tell "not a
 * module I can audit" from "a module whose source I failed to find".
 */
export const sourceForTarget = (target: ExportTarget): string | null => {
  const built = typeof target === 'object' ? (target.import ?? target.default) : undefined
  if (built === undefined || !built.startsWith('./dist/') || !built.endsWith('.js')) return null
  return `./src/${built.slice('./dist/'.length, -'.js'.length)}.ts`
}

export type PackageManifest = {
  name?: string
  private?: boolean
  files?: string[]
  exports?: Record<string, ExportTarget>
}

/** One thing a package's `AI.md` does not hold up to, phrased for a CI log. */
export type AiDocFinding = { package: string; problem: string }

/**
 * Subpaths a consumer never types. `jsx-runtime` and `jsx-dev-runtime` are
 * resolved by the JSX transform from `jsxImportSource`, so documenting the
 * specifier itself would be noise — what a consumer needs is the `tsconfig`
 * line, and the audit checks for that separately.
 */
const TRANSFORM_SUBPATHS = ['./jsx-runtime', './jsx-dev-runtime']

/**
 * Exports that exist for the runtime, the JSX transform or another package in
 * this repo rather than for a human, listed per package so a *new* export
 * cannot join them by accident. Adding one here is a claim that no consumer
 * ever writes it; anything else has to earn a line in the package's `AI.md`.
 */
export const INTERNAL_EXPORTS: Record<string, readonly string[]> = {
  // The tree operations and prop appliers are what the compiled JSX calls. A
  // consumer writes the tags and lets the transform reach for these.
  '@amritk/mini-lynx': [
    'addEvent',
    'appendChildren',
    'applyProp',
    'applyStyle',
    'applyVisible',
    'createElement',
    'createRawText',
    'createWrapper',
    'firstChild',
    'nextSibling',
    'renderChild',
    'setText',
    'toCssName',
    'toStyleText',
    // Installed by `renderPage`; an app that calls it directly is fighting the entry point.
    'setGlobalProps',
    // The default transport, already installed. Only its *alternative* is a decision.
    'workletTransport',
    // Reached through `setErrorHandler`; the runtime is what reports.
    'reportError',
  ],
  // `clearNamedHandlers` is teardown for the fallback transport's own tests.
  '@amritk/mini-lynx/bridge': ['clearNamedHandlers'],
  // Gesture ids are minted by `setGestureDetector` itself.
  '@amritk/mini-lynx/gestures': ['nextGestureId'],
  // Written by `trackKeyboard` from the engine event; an app reads `keyboardHeight`.
  '@amritk/mini-lynx/keyboard': ['setKeyboardHeight'],
}

/** Splits `a, type B, c as d` into its value names — `export type { … }` never reaches here. */
const valueNames = (clause: string): string[] =>
  clause
    .split(',')
    .map((specifier) => specifier.trim())
    .filter((specifier) => specifier.length > 0 && !specifier.startsWith('type '))
    .map((specifier) => (specifier.includes(' as ') ? (specifier.split(' as ').pop() ?? '') : specifier).trim())
    .filter((name) => /^[A-Za-z_$][\w$]*$/.test(name))

/**
 * Every runtime binding a module re-exports. Types are deliberately out of
 * scope: an `AI.md` documents shapes by writing them out, not by naming the
 * alias, so requiring the identifier would push these files toward being a
 * second copy of the `.d.ts` — which is the one thing they must not become.
 */
export const publicValueExports = (source: string): string[] => {
  const names = new Set<string>()
  for (const match of source.matchAll(/export\s+\{([^}]*)\}/g)) {
    // `export type { … }` is a type-only block; the `type` sits before the brace.
    const isTypeOnly = /export\s+type\s*$/.test(source.slice(0, match.index))
    if (isTypeOnly) continue
    for (const name of valueNames(match[1] ?? '')) names.add(name)
  }
  for (const match of source.matchAll(/export\s+(?:const|function|class)\s+([A-Za-z_$][\w$]*)/g)) {
    names.add(match[1] ?? '')
  }
  return [...names].filter((name) => name.length > 0)
}

/** The specifier a consumer writes: `.` is the package itself, `./router` hangs off it. */
export const specifierFor = (name: string, subpath: string): string =>
  subpath === '.' ? name : `${name}${subpath.slice(1)}`

const subpathsOf = (manifest: PackageManifest): string[] =>
  Object.entries(manifest.exports ?? {})
    .filter(([subpath, target]) => {
      if (subpath.endsWith('.json') || TRANSFORM_SUBPATHS.includes(subpath)) return false
      // Only entries naming a built module have source behind them to read.
      return sourceForTarget(target) !== null
    })
    .map(([subpath]) => subpath)

/**
 * Audits one package. `read` is injected so the test can drive fixtures, and so
 * a missing file is a finding rather than a thrown error — a package with no
 * `AI.md` at all is the case this exists to catch.
 */
export const auditPackage = (
  manifest: PackageManifest,
  read: (relativePath: string) => string | null,
): AiDocFinding[] => {
  const name = manifest.name ?? '(unnamed)'
  const findings: AiDocFinding[] = []
  const add = (problem: string): void => void findings.push({ package: name, problem })

  const doc = read('AI.md')
  if (doc === null) {
    add('has no AI.md — every published package ships one next to its README')
    return findings
  }

  if (!(manifest.files ?? []).includes('AI.md')) {
    add('does not list "AI.md" in package.json "files", so npm would not ship it')
  }

  const heading = `# AI.md — ${name}`
  if (!doc.startsWith(`${heading}\n`)) {
    add(`must open with "${heading}" — llms-full.txt concatenates these, and the heading is the only divider`)
  }

  if (!doc.includes('AGENTS.md')) {
    add('does not point at AGENTS.md, leaving an agent editing the repo with no way back to the invariants')
  }

  // A package shipping `android/` or `ios/` carries native halves this repo
  // cannot fully build and has never run on a device. That is the first thing a
  // consumer needs and the easiest to leave out, so it is the one section the
  // audit insists on: `lynx-dialogs` shipped without it once already.
  const shipsNative = (manifest.files ?? []).some((entry) => entry === 'android' || entry === 'ios')
  if (shipsNative && !doc.includes('## Status')) {
    add('ships native sources but has no "## Status" section saying what has and has not run on a device')
  }

  const internal = new Set(Object.entries(INTERNAL_EXPORTS).flatMap(([, names]) => names))
  for (const subpath of subpathsOf(manifest)) {
    const specifier = specifierFor(name, subpath)
    if (!doc.includes(specifier)) {
      add(`never mentions the published subpath "${specifier}"`)
      continue
    }
    const target = manifest.exports?.[subpath]
    const entry = target === undefined ? null : sourceForTarget(target)
    const source = entry === null ? null : read(entry)
    if (source === null) continue

    const allowed = new Set(INTERNAL_EXPORTS[specifier] ?? [])
    for (const exported of publicValueExports(source)) {
      // A name allow-listed anywhere in the repo is internal everywhere: the
      // runtimes re-export each other's helpers under the same names.
      if (allowed.has(exported) || internal.has(exported)) continue
      if (!doc.includes(exported)) add(`exports "${exported}" from "${specifier}" but never documents it`)
    }
  }

  return findings
}

/** Audits every published package under `<root>/packages`. */
export const auditAiDocs = (root: string): AiDocFinding[] => {
  const findings: AiDocFinding[] = []
  for (const dir of readdirSync(join(root, 'packages')).sort()) {
    const packageRoot = join(root, 'packages', dir)
    const read = (relativePath: string): string | null => {
      try {
        return readFileSync(join(packageRoot, relativePath), 'utf8')
      } catch {
        return null
      }
    }
    const manifestSource = read('package.json')
    if (manifestSource === null) continue
    const manifest = JSON.parse(manifestSource) as PackageManifest
    if (manifest.private === true) continue
    findings.push(...auditPackage(manifest, read))
  }
  return findings
}
