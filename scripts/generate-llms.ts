/**
 * generate-llms — builds `llms.txt` and `llms-full.txt` at the repo root from
 * the package's `package.json` + `AI.md`, following the llmstxt.org convention.
 *
 * - `llms.txt` is a curated, link-rich index: a coding agent (or a docs crawler)
 *   fetches it, then follows the links it needs.
 * - `llms-full.txt` inlines `AI.md` into one file — the paste-into-context
 *   bundle for an agent with no network access.
 *
 * Generated from source so the AI-facing docs can't drift: edit `AI.md` or the
 * package description, then re-run `bun run generate-llms`. Deterministic (no
 * timestamps) so the output is stable in git.
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(import.meta.dir, '..')
const REPO = 'https://github.com/amritk/niv'
const BRANCH = 'main'

const manifest = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as {
  name: string
  description?: string
  exports?: Record<string, unknown>
}
const aiDoc = readFileSync(join(ROOT, 'AI.md'), 'utf8').trim()

/** Every subpath a consumer imports, in the order the exports map lists them. */
const entries = Object.keys(manifest.exports ?? {})
  .filter((key) => !key.endsWith('.json') && !key.includes('jsx-'))
  .map((key) => (key === '.' ? manifest.name : `${manifest.name}/${key.slice('./'.length)}`))

const buildIndex = (): string => {
  const lines: string[] = []
  lines.push('# niv')
  lines.push('')
  lines.push(
    '> A deliberately tiny signals UI runtime for the DOM: reactive bindings, keyed lists, static-template cloning and a compilerless JSX runtime. No virtual DOM, no diffing, no re-render.',
  )
  lines.push('')
  lines.push(
    `niv is a pre-alpha, single-package library published as \`${manifest.name}\` (formerly \`@amritk/mini\`). Its \`AI.md\` is a mental model, a minimal runnable example, and the gotchas most likely to trip up an LLM; \`llms-full.txt\` inlines it.`,
  )
  lines.push('')
  lines.push('## Docs')
  lines.push('')
  lines.push(`- [AI.md](${REPO}/blob/${BRANCH}/AI.md): ${manifest.description ?? ''}`)
  lines.push(`- [README](${REPO}/blob/${BRANCH}/README.md): the human-facing guide to every entry point`)
  lines.push('')
  lines.push('## Entry points')
  lines.push('')
  for (const entry of entries) lines.push(`- \`${entry}\``)
  lines.push('')
  lines.push('## Optional')
  lines.push('')
  lines.push(`- [Full AI docs bundle](${REPO}/blob/${BRANCH}/llms-full.txt): AI.md in one file`)
  lines.push(`- [Repository](${REPO}): source, issues, and the playground`)
  lines.push('')
  return lines.join('\n')
}

const buildFull = (): string =>
  [
    '# niv — full AI documentation bundle',
    '',
    'Generated from AI.md by `scripts/generate-llms.ts`. This is the paste-into-context bundle; the curated index is `llms.txt`.',
    '',
    '---',
    '',
    aiDoc,
    '',
  ].join('\n')

writeFileSync(join(ROOT, 'llms.txt'), buildIndex())
writeFileSync(join(ROOT, 'llms-full.txt'), buildFull())
console.log('Wrote llms.txt and llms-full.txt.')
