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

  it('depends on both build paths, and on nothing from this repo that does not exist', async () => {
    const manifest = JSON.parse(await read('package.json')) as {
      dependencies: Record<string, string>
      devDependencies: Record<string, string>
    }

    expect(manifest.dependencies['@amritk/mini-lynx']).toBeDefined()
    expect(manifest.devDependencies['@amritk/mini-lynx-preview']).toBeDefined()
    expect(manifest.devDependencies['@amritk/mini-lynx-rsbuild-plugin']).toBeDefined()

    const ours = [...Object.keys(manifest.dependencies), ...Object.keys(manifest.devDependencies)].filter((name) =>
      name.startsWith('@amritk/'),
    )
    const published = await readdir(join(templateDirectory(), '..', '..'))
    for (const name of ours) {
      expect(published, `${name} is a package in this repo`).toContain(name.slice('@amritk/'.length))
    }
  })

  // Both loops are the template's whole claim: a browser preview with no phone
  // in it, and a real `.lynx.bundle` for one.
  it('offers both loops as scripts, under the names the READMEs print', async () => {
    const manifest = JSON.parse(await read('package.json')) as { scripts: Record<string, string> }

    expect(manifest.scripts['dev']).toBe('vite')
    expect(manifest.scripts['dev:device']).toBe('rspeedy dev')
    expect(manifest.scripts['build']).toBeDefined()
    expect(manifest.scripts['build:device']).toBeDefined()
  })

  // The device build reads its entry from here, and a rename that missed this
  // file fails at `rspeedy dev` rather than at any check in this repo.
  it('points the device build at entries that exist', async () => {
    const config = await read('lynx.config.ts')
    const entry = /entry: \{ main: '\.\/([^']+)' \}/.exec(config)?.[1]
    const background = /background: '\.\/([^']+)'/.exec(config)?.[1]

    expect(entry).toBe('src/main-thread.ts')
    expect(background).toBe('src/background.ts')
    await expect(read(...(entry ?? '').split('/'))).resolves.toContain('renderPage')
    await expect(read(...(background ?? '').split('/'))).resolves.toContain('installNativeBridge')
  })

  // Withholding the DOM from the device pass is what turns "do not name
  // `document` in app code" from a comment into something the compiler says.
  // Both configs carry comments, so they are read as text rather than JSON.
  it('type-checks the device half and the browser half separately', async () => {
    const manifest = JSON.parse(await read('package.json')) as { scripts: Record<string, string> }

    expect(manifest.scripts['types:check']).toContain('-p tsconfig.json')
    expect(manifest.scripts['types:check']).toContain('-p tsconfig.preview.json')
    expect(await read('tsconfig.json')).toContain('"lib": ["ESNext"]')
    expect(await read('tsconfig.json')).toContain('"exclude": ["src/preview"')
    expect(await read('tsconfig.preview.json')).toContain('"lib": ["ESNext", "DOM", "DOM.Iterable"]')
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
    for (const file of ['app.tsx', 'main-thread.ts', 'background.ts', 'styles.css']) {
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
