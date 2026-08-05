import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import {
  type AiDocFinding,
  auditAiDocs,
  auditPackage,
  type PackageManifest,
  publicValueExports,
  sourceForTarget,
} from './ai-docs'

const MANIFEST: PackageManifest = {
  name: '@amritk/thing',
  files: ['dist', 'AI.md'],
  exports: {
    './package.json': './package.json',
    '.': { types: './dist/index.d.ts', import: './dist/index.js', default: './dist/index.js' },
  },
}

const DOC = ['# AI.md — @amritk/thing', '', 'See [`AGENTS.md`](./AGENTS.md).', '', 'Call `doThing()`.', ''].join('\n')

/** A reader over an in-memory package, so the audit never touches the working tree. */
const reader =
  (files: Record<string, string>) =>
  (path: string): string | null =>
    files[path] ?? null

const problems = (findings: AiDocFinding[]): string[] => findings.map((finding) => finding.problem)

describe('ai-docs', () => {
  it('passes a package whose AI.md documents everything it exports', () => {
    const findings = auditPackage(
      MANIFEST,
      reader({ 'AI.md': DOC, './src/index.ts': 'export const doThing = () => {}' }),
    )
    expect(findings).toEqual([])
  })

  it('flags a package with no AI.md at all, and says nothing else about it', () => {
    const findings = auditPackage(MANIFEST, reader({}))
    expect(problems(findings)).toEqual(['has no AI.md — every published package ships one next to its README'])
  })

  it('flags an AI.md that npm would not ship', () => {
    const manifest = { ...MANIFEST, files: ['dist'] }
    const findings = auditPackage(manifest, reader({ 'AI.md': DOC, './src/index.ts': '' }))
    expect(problems(findings)).toContainEqual(expect.stringContaining('"files"'))
  })

  it('flags a heading that would not divide llms-full.txt', () => {
    const doc = DOC.replace('# AI.md — @amritk/thing', '# @amritk/thing — notes for agents')
    const findings = auditPackage(MANIFEST, reader({ 'AI.md': doc, './src/index.ts': '' }))
    expect(problems(findings)).toContainEqual(expect.stringContaining('must open with'))
  })

  it('flags an export the AI.md never mentions', () => {
    const source = 'export const doThing = () => {}\nexport const doOther = () => {}'
    const findings = auditPackage(MANIFEST, reader({ 'AI.md': DOC, './src/index.ts': source }))
    expect(problems(findings)).toEqual(['exports "doOther" from "@amritk/thing" but never documents it'])
  })

  it('flags a published subpath the AI.md never names', () => {
    const manifest = {
      ...MANIFEST,
      exports: { ...MANIFEST.exports, './testing': { import: './dist/testing/index.js' } },
    }
    const findings = auditPackage(manifest, reader({ 'AI.md': DOC, './src/index.ts': '' }))
    expect(problems(findings)).toEqual(['never mentions the published subpath "@amritk/thing/testing"'])
  })

  // Requiring the specifier would be noise: a consumer reaches these through
  // `jsxImportSource`, never by writing the import.
  it('does not ask for the JSX transform subpaths to be documented', () => {
    const manifest = {
      ...MANIFEST,
      exports: { ...MANIFEST.exports, './jsx-runtime': { import: './dist/jsx-runtime.js' } },
    }
    const findings = auditPackage(manifest, reader({ 'AI.md': DOC, './src/index.ts': '' }))
    expect(findings).toEqual([])
  })

  it('insists a package shipping native sources says what has run on a device', () => {
    const manifest = { ...MANIFEST, files: ['dist', 'android', 'ios', 'AI.md'] }
    const findings = auditPackage(manifest, reader({ 'AI.md': DOC, './src/index.ts': '' }))
    expect(problems(findings)).toContainEqual(expect.stringContaining('## Status'))
  })

  it('reads values but not types, so an AI.md is never pushed toward being a second .d.ts', () => {
    const source = [
      "export type { Alone } from './alone'",
      "export { doThing, type Shape } from './thing'",
      "export { inner as renamed } from './inner'",
      'export const made = 1',
      'export type Local = string',
    ].join('\n')
    expect(publicValueExports(source).sort()).toEqual(['doThing', 'made', 'renamed'])
  })

  // This mapping replaced the `development` condition, which named the source
  // outright. It is the audit's only route from a manifest to a file now, so a
  // silent null here would take every export check down with it.
  it('maps a built export target back to the source it came from', () => {
    expect(sourceForTarget({ import: './dist/index.js' })).toBe('./src/index.ts')
    expect(sourceForTarget({ import: './dist/router/browser/index.js' })).toBe('./src/router/browser/index.ts')
    expect(sourceForTarget({ default: './dist/jsx-runtime.js' })).toBe('./src/jsx-runtime.ts')
  })

  it('has no source to offer for an entry that names no built module', () => {
    expect(sourceForTarget('./package.json')).toBeNull()
    expect(sourceForTarget({ import: './lynx.lib.json' })).toBeNull()
  })

  // The gate itself: the checked-in packages have to satisfy their own contract.
  it('finds nothing wrong with the packages in this repo', () => {
    expect(auditAiDocs(join(import.meta.dirname, '..'))).toEqual([])
  })
})
