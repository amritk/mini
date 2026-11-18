/**
 * The structural contract the package's `AI.md` keeps — the logic behind
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

import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * One `exports` entry. A bare string for `./package.json`-style passthroughs,
 * otherwise the condition map, whose `import`/`default` name the built module.
 */
export type ExportTarget = string | { import?: string; default?: string }

/**
 * The source file a `./dist/` export target was built from.
 *
 * It holds because the package builds with `rootDir: "src"` and
 * `outDir: "dist"`, which is what makes `dist/x/index.js` and `src/x/index.ts`
 * the same module by construction.
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
 * Exports that exist for the runtime or the JSX transform rather than for a
 * human, listed per specifier so a *new* export cannot join them by accident.
 * Adding one here is a claim that no consumer ever writes it; anything else has
 * to earn a line in `AI.md`. Empty today — every value export is public API.
 */
export const INTERNAL_EXPORTS: Record<string, readonly string[]> = {}

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
      if (allowed.has(exported)) continue
      if (!doc.includes(exported)) add(`exports "${exported}" from "${specifier}" but never documents it`)
    }
  }

  return findings
}

/** Audits the package at the repo root — the only one this repo publishes. */
export const auditAiDocs = (root: string): AiDocFinding[] => {
  const read = (relativePath: string): string | null => {
    try {
      return readFileSync(join(root, relativePath), 'utf8')
    } catch {
      return null
    }
  }
  const manifestSource = read('package.json')
  if (manifestSource === null) return [{ package: root, problem: 'has no package.json' }]
  return auditPackage(JSON.parse(manifestSource) as PackageManifest, read)
}
