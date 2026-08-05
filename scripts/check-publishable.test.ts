import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

// @ts-expect-error -- plain JS so `prepublishOnly` can run it under bare node.
import { checkPublishable } from './check-publishable.mjs'

const HEALTHY = {
  name: '@amritk/healthy',
  exports: {
    './package.json': './package.json',
    '.': { types: './dist/index.d.ts', import: './dist/index.js', default: './dist/index.js' },
  },
}

describe('check-publishable', () => {
  let root: string

  /** Writes a package directory, creating whichever of dist/LICENSE it is told to. */
  const write = async (
    name: string,
    pkg: Record<string, unknown>,
    { dist = true, license = true }: { dist?: boolean; license?: boolean } = {},
  ): Promise<string> => {
    const dir = join(root, name)
    await mkdir(dir, { recursive: true })
    await writeFile(join(dir, 'package.json'), JSON.stringify(pkg), 'utf-8')
    if (dist) {
      await mkdir(join(dir, 'dist'), { recursive: true })
      await writeFile(join(dir, 'dist/index.js'), 'export const ok = true\n', 'utf-8')
      await writeFile(join(dir, 'dist/index.d.ts'), 'export declare const ok: boolean\n', 'utf-8')
    }
    if (license) await writeFile(join(dir, 'LICENSE'), 'MIT License\n', 'utf-8')
    return dir
  }

  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), 'mini-check-publishable-'))
  })

  afterAll(async () => {
    await rm(root, { recursive: true, force: true })
  })

  it('passes a package whose build output, manifest and LICENSE all line up', async () => {
    expect(checkPublishable(await write('healthy', HEALTHY))).toEqual([])
  })

  it('rejects the shape that shipped: a manifest promising dist against a tree with none', async () => {
    const problems = checkPublishable(await write('unbuilt', HEALTHY, { dist: false }))
    expect(problems).toHaveLength(1)
    expect(problems[0]).toContain('./dist/index.js')
    expect(problems[0]).toContain('bun run build')
  })

  it('rejects a surviving development condition, which resolves to the src it also ships', async () => {
    const pkg = {
      ...HEALTHY,
      exports: { ...HEALTHY.exports, '.': { development: './src/index.ts', ...HEALTHY.exports['.'] } },
    }
    const problems = checkPublishable(await write('undstripped', pkg))
    expect(problems).toHaveLength(1)
    expect(problems[0]).toContain('development')
  })

  it('rejects a missing LICENSE, which npm only bundles from inside the package', async () => {
    const problems = checkPublishable(await write('unlicensed', HEALTHY, { license: false }))
    expect(problems).toHaveLength(1)
    expect(problems[0]).toContain('LICENSE')
  })

  it('rejects an exports map with no dist target at all, rather than passing vacuously', async () => {
    const pkg = { name: '@amritk/srconly', exports: { '.': { default: './src/index.ts' } } }
    const problems = checkPublishable(await write('srconly', pkg))
    expect(problems).toHaveLength(1)
    expect(problems[0]).toContain('no ./dist/ target')
  })

  it('reports every problem at once, so one publish attempt names them all', async () => {
    expect(checkPublishable(await write('broken', HEALTHY, { dist: false, license: false }))).toHaveLength(2)
  })

  it('has nothing to say about a private package, which npm will not publish', async () => {
    const pkg = { name: '@amritk/playground', private: true, exports: { '.': './src/index.ts' } }
    expect(checkPublishable(await write('private', pkg, { dist: false, license: false }))).toEqual([])
  })
})
