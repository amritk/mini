/**
 * CI gate: fails when a package's `AI.md` has drifted from what the package
 * actually publishes. Runs beside `check:reactivity` rather than in a Vitest
 * suite, because it needs neither a build nor the src aliases — it only reads
 * manifests and Markdown, so it should fail in the first minute of CI.
 */

import { join } from 'node:path'

import { auditAiDocs } from './ai-docs'

const findings = auditAiDocs(join(import.meta.dir, '..'))

if (findings.length === 0) {
  console.log('AI.md docs are in sync with every published surface.')
  process.exit(0)
}

console.error(`${findings.length} AI.md problem${findings.length === 1 ? '' : 's'}:\n`)
for (const finding of findings) console.error(`  ${finding.package} — ${finding.problem}`)
console.error('\nDocument the surface in the package AI.md, or record it in INTERNAL_EXPORTS in scripts/ai-docs.ts.')
process.exit(1)
