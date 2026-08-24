import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import { templateDirectory } from './scaffold'

/**
 * The template is a real, installable app rather than a bag of placeholder
 * files, so the things that can go wrong with it are structural: a file the
 * HTML entry points at getting renamed, the manifest naming a package that does
 * not exist, or device code quietly acquiring a browser global.
 *
 * None of that is caught by scaffolding successfully — every one of these
 * copies perfectly and then fails on the user's first `bun run dev`.
 */
describe('template', () => {
  const read = (...parts: string[]): Promise<string> => readFile(join(templateDirectory(), ...parts), 'utf-8')

  it('depends on the runtime and the preview engine, and nothing else from this repo', async () => {
    const manifest = JSON.parse(await read('package.json')) as {
      dependencies: Record<string, string>
      devDependencies: Record<string, string>
    }

    expect(manifest.dependencies['@amritk/mini-lynx']).toBeDefined()
    expect(manifest.devDependencies['@amritk/mini-lynx-preview']).toBeDefined()

    const ours = [...Object.keys(manifest.dependencies), ...Object.keys(manifest.devDependencies)].filter((name) =>
      name.startsWith('@amritk/'),
    )
    const published = await readdir(join(templateDirectory(), '..', '..'))
    for (const name of ours) {
      expect(published, `${name} is a package in this repo`).toContain(name.slice('@amritk/'.length))
    }
  })

  it('offers the dev script every instruction in the repo tells people to run', async () => {
    const manifest = JSON.parse(await read('package.json')) as { scripts: Record<string, string> }

    expect(manifest.scripts['dev']).toBe('vite')
    expect(manifest.scripts['build']).toBeDefined()
  })

  it('points its HTML entry at a file that exists', async () => {
    const html = await read('index.html')
    const entry = /<script type="module" src="\/([^"]+)"/.exec(html)?.[1]

    expect(entry).toBe('src/preview/main.ts')
    await expect(read(...(entry ?? '').split('/'))).resolves.toContain('createDomPapi')
  })

  // `#app` is the container the Element PAPI attaches its page element to. The
  // entry throws without it, so the two halves have to agree on the id.
  it('gives the preview engine the container it looks for', async () => {
    expect(await read('index.html')).toContain('id="app"')
    expect(await read('src', 'preview', 'main.ts')).toContain("getElementById('app')")
  })

  // The split the template exists to teach: everything outside `preview/` is
  // the app, and a device has no `document` to reach for.
  it('keeps browser globals out of the code that ships to a device', async () => {
    for (const file of ['app.tsx', 'device.ts', 'styles.css']) {
      const source = await read('src', file)
      expect(source, `src/${file} names no browser global`).not.toMatch(/\b(document|window|localStorage)\b/)
    }
  })

  it('stores the dotfiles npm would mangle under their placeholder names', async () => {
    const entries = await readdir(templateDirectory())

    expect(entries).toContain('_gitignore')
    expect(entries).not.toContain('.gitignore')
  })
})
