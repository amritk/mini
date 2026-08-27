import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import { DEFAULT_NAME, scaffold, templateDirectory, toPackageName } from './scaffold'

/**
 * The scaffolder runs against the real template rather than a fixture, on
 * purpose: half of what can break here is the template drifting — a file
 * renamed, `_gitignore` losing its underscore — and a fixture would keep
 * passing through all of it.
 */
describe('scaffold', () => {
  const temporary: string[] = []

  const target = async (): Promise<string> => {
    const dir = await mkdtemp(join(tmpdir(), 'create-mini-lynx-'))
    temporary.push(dir)
    return join(dir, 'my-app')
  }

  afterEach(async () => {
    await Promise.all(temporary.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
  })

  it('writes the whole template into a new directory', async () => {
    const result = await scaffold({ directory: await target() })

    expect(result.files).toEqual(
      expect.arrayContaining([
        '.gitignore',
        'README.md',
        'index.html',
        'package.json',
        'tsconfig.json',
        'vite.config.ts',
        'lynx.config.ts',
        join('src', 'app.tsx'),
        join('src', 'background.ts'),
        join('src', 'main-thread.ts'),
        join('src', 'styles.css'),
        join('src', 'preview', 'main.ts'),
      ]),
    )
  })

  // npm renames a published `.gitignore` to `.npmignore`, so the template
  // stores it under a placeholder. Getting that undone is the difference
  // between a scaffolded app that ignores `node_modules` and one that commits it.
  it('restores the dotfiles npm will not ship under their real names', async () => {
    const result = await scaffold({ directory: await target() })

    expect(result.files).toContain('.gitignore')
    expect(result.files).not.toContain('_gitignore')
  })

  it('names the package after the directory', async () => {
    const result = await scaffold({ directory: await target() })

    expect(result.name).toBe('my-app')
    expect(JSON.parse(await readFile(join(result.directory, 'package.json'), 'utf-8')).name).toBe('my-app')
  })

  it('takes an explicit name over the directory', async () => {
    const result = await scaffold({ directory: await target(), name: '@acme/storefront' })

    expect(JSON.parse(await readFile(join(result.directory, 'package.json'), 'utf-8')).name).toBe('@acme/storefront')
  })

  it('leaves the rest of the manifest alone', async () => {
    const result = await scaffold({ directory: await target() })
    const written = JSON.parse(await readFile(join(result.directory, 'package.json'), 'utf-8'))
    const template = JSON.parse(await readFile(join(templateDirectory(), 'package.json'), 'utf-8'))

    expect(written.dependencies).toEqual(template.dependencies)
    expect(written.scripts).toEqual(template.scripts)
  })

  // Refusing is the whole behaviour worth having here: a scaffolder that
  // half-overwrites someone's directory destroys work the copy cannot undo.
  it('refuses a directory that already has something in it', async () => {
    const directory = await target()
    await scaffold({ directory })
    await expect(scaffold({ directory })).rejects.toThrow(/not empty/)
  })

  it('writes into an existing empty directory', async () => {
    const directory = await target()
    await scaffold({ directory })
    await rm(join(directory, 'package.json'))
    await rm(join(directory, 'src'), { recursive: true })
    await rm(join(directory, 'index.html'))
    await rm(join(directory, 'README.md'))
    await rm(join(directory, 'tsconfig.json'))
    await rm(join(directory, 'tsconfig.preview.json'))
    await rm(join(directory, 'vite.config.ts'))
    await rm(join(directory, 'lynx.config.ts'))
    await rm(join(directory, '.gitignore'))

    await expect(scaffold({ directory })).resolves.toMatchObject({ name: 'my-app' })
  })

  it('copies a caller-supplied template', async () => {
    const directory = await target()
    const custom = await mkdtemp(join(tmpdir(), 'create-mini-lynx-template-'))
    temporary.push(custom)
    await writeFile(join(custom, 'package.json'), '{"name":"placeholder","private":true}\n', 'utf-8')

    const result = await scaffold({ directory, templateDirectory: custom })

    expect(result.files).toEqual(['package.json'])
    expect(JSON.parse(await readFile(join(result.directory, 'package.json'), 'utf-8'))).toEqual({
      name: 'my-app',
      private: true,
    })
  })

  it('turns a directory name into something npm accepts', () => {
    expect(toPackageName('My App')).toBe('my-app')
    expect(toPackageName('storefront')).toBe('storefront')
    expect(toPackageName('@acme/storefront')).toBe('@acme/storefront')
    // npm reserves both leading characters, and a name of pure punctuation
    // leaves nothing to salvage.
    expect(toPackageName('.hidden')).toBe('hidden')
    expect(toPackageName('_private')).toBe('private')
    expect(toPackageName('...')).toBe(DEFAULT_NAME)
    expect(toPackageName('a/b')).toBe(DEFAULT_NAME)
  })
})
