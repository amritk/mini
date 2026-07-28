import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'

import { stripDevelopment, stripDevelopmentExports } from './strip-development-exports'

describe('strip-development-exports', () => {
  let root: string

  const writePackage = async (name: string, pkg: Record<string, unknown>): Promise<string> => {
    const dir = join(root, 'packages', name)
    await mkdir(dir, { recursive: true })
    const path = join(dir, 'package.json')
    await writeFile(path, `${JSON.stringify(pkg, null, 2)}\n`, 'utf-8')
    return path
  }

  const readPackage = async (path: string): Promise<{ name?: string; exports?: Record<string, unknown> }> =>
    JSON.parse(await readFile(path, 'utf-8')) as { name?: string; exports?: Record<string, unknown> }

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'mini-strip-dev-'))
  })

  afterAll(async () => {
    await rm(root, { recursive: true, force: true })
  })

  it('removes the development condition at every depth of an exports map', () => {
    const exports = {
      '.': { development: './src/index.ts', types: './dist/index.d.ts', import: './dist/index.js' },
      './hosts/memory': { development: './src/hosts/memory.ts', import: './dist/hosts/memory.js' },
    }
    expect(stripDevelopment(exports)).toBe(true)
    expect(exports).toEqual({
      '.': { types: './dist/index.d.ts', import: './dist/index.js' },
      './hosts/memory': { import: './dist/hosts/memory.js' },
    })
  })

  it('reports no change for an exports map that never mentions development', () => {
    const exports = { '.': { types: './dist/index.d.ts', import: './dist/index.js' } }
    expect(stripDevelopment(exports)).toBe(false)
    expect(exports).toEqual({ '.': { types: './dist/index.d.ts', import: './dist/index.js' } })
  })

  it('leaves a plain string target alone', () => {
    // `"./package.json": "./package.json"` is a string, not a conditions
    // object — the walk must not choke on it or try to rewrite it.
    expect(stripDevelopment('./package.json')).toBe(false)
  })

  it('rewrites every workspace manifest that carries the condition', async () => {
    const miniPath = await writePackage('mini', {
      name: '@amritk/mini',
      exports: {
        './package.json': './package.json',
        '.': { development: './src/index.ts', types: './dist/index.d.ts', import: './dist/index.js' },
      },
    })
    const nativePath = await writePackage('mini-lynx', {
      name: '@amritk/mini-lynx',
      exports: { '.': { development: './src/index.ts', import: './dist/index.js' } },
    })

    expect((await stripDevelopmentExports(root)).sort()).toEqual(['@amritk/mini', '@amritk/mini-lynx'])

    const mini = await readPackage(miniPath)
    expect(mini.exports).toEqual({
      './package.json': './package.json',
      '.': { types: './dist/index.d.ts', import: './dist/index.js' },
    })
    // Fields other than `exports` survive the rewrite untouched.
    expect(mini.name).toBe('@amritk/mini')
    expect((await readPackage(nativePath)).exports).toEqual({ '.': { import: './dist/index.js' } })
  })

  it('is idempotent, so a second publish attempt rewrites nothing', async () => {
    await writePackage('mini', {
      name: '@amritk/mini',
      exports: { '.': { development: './src/index.ts', import: './dist/index.js' } },
    })
    expect(await stripDevelopmentExports(root)).toEqual(['@amritk/mini'])
    expect(await stripDevelopmentExports(root)).toEqual([])
  })

  it('skips a package with no exports map at all', async () => {
    await writePackage('tooling', { name: '@amritk/tooling', private: true })
    expect(await stripDevelopmentExports(root)).toEqual([])
  })
})
