import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

// The last gate before a tarball leaves the machine. `@amritk/mini-lynx-native@0.2.0`
// went to npm as src-only: it was published by hand rather than through the release
// job, so `bun run build`, strip-development-exports and copy-license never ran. The
// manifest still promised `./dist/index.js`, the tarball carried no dist at all, and
// the surviving `development` condition meant a bundler that honoured it resolved the
// raw TypeScript and looked healthy — which is how a broken package stayed usable
// enough that nobody noticed for a release.
//
// Every check here is one of those three misses. `npm publish` runs this from the
// package root as `prepublishOnly`, so publishing out of band fails loudly instead of
// shipping a manifest whose exports point at files that are not there. The equivalent
// checks in scripts/dist-smoke.test.ts and scripts/consumer-e2e.test.ts guard the same
// ground for the repo; this one guards the act of publishing, which is the part a CI
// step cannot reach.

/** Every `./dist/...` target declared anywhere in an exports subtree. */
const distTargets = (node, found = []) => {
  if (typeof node === 'string') {
    if (node.startsWith('./dist/')) found.push(node)
    return found
  }
  if (node === null || typeof node !== 'object') return found
  for (const value of Object.values(node)) distTargets(value, found)
  return found
}

/** True when a `development` condition survives anywhere in an exports subtree. */
const hasDevelopmentCondition = (node) => {
  if (node === null || typeof node !== 'object') return false
  if ('development' in node) return true
  return Object.values(node).some(hasDevelopmentCondition)
}

/**
 * Returns the reasons `dir` must not be published, empty when it is publishable.
 * A private package is publishable by definition — npm will not publish it.
 */
export const checkPublishable = (dir) => {
  const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf-8'))
  if (pkg.private === true) return []

  const problems = []

  const targets = [...new Set(distTargets(pkg.exports ?? {}))]
  if (targets.length === 0) {
    // Not a stylistic complaint: an exports map with no dist target is how this
    // check goes quiet, and a quiet check is worse than no check.
    problems.push('exports declares no ./dist/ target — the build output is not reachable from the manifest')
  }
  const missing = targets.filter((target) => !existsSync(join(dir, target)))
  if (missing.length > 0) {
    problems.push(`exports points at files that do not exist — run \`bun run build\`:\n  ${missing.join('\n  ')}`)
  }

  if (hasDevelopmentCondition(pkg.exports ?? {})) {
    // The condition resolves to `./src/*.ts`, and src ships, so leaving it in
    // hands raw TypeScript to any consumer or bundler that honours it.
    problems.push(
      'exports still carries a `development` condition — run `bun run scripts/strip-development-exports.ts`',
    )
  }

  if (!existsSync(join(dir, 'LICENSE'))) {
    problems.push('no LICENSE in the package directory — run `bun run scripts/copy-license.ts`')
  }

  return problems
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const dir = process.argv[2] ?? process.cwd()
  const problems = checkPublishable(dir)
  if (problems.length > 0) {
    const name = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf-8')).name ?? dir
    console.error(`${name} is not publishable as it stands:\n\n${problems.map((p) => `- ${p}`).join('\n')}\n`)
    console.error('Publish through the release workflow (`bun run release:publish`), which prepares all three.')
    process.exit(1)
  }
}
