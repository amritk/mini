import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { ROOT, runCommand, runNode } from './e2e-helpers'

/**
 * The npm consumer's path, end to end: pack the package exactly the way
 * `changeset publish` does, install the tarball into scratch projects, and
 * drive it under plain Node.
 *
 * Nothing else in the pipeline sees this. The unit tests alias the package to
 * its `src/`, and dist-smoke loads `dist/` by absolute path — so a broken
 * `files` list, or an exports map that points at a file the tarball does not
 * carry, looks perfectly healthy right up until the first `npm install` of the
 * published package.
 *
 * Requires a prior `bun run build`; run via `bun run test:dist`.
 */

type Manifest = {
  name: string
  version: string
  exports?: Record<string, unknown>
} & Partial<Record<'dependencies' | 'devDependencies' | 'peerDependencies', Record<string, string>>>

/**
 * Subpaths whose module graph statically reaches an optional peer, so they only
 * resolve once that peer is installed. Everything else must import with nothing
 * but the package itself — that is the promise `.` makes to the widget bundle.
 */
const PEER_BACKED_SUBPATHS: Record<string, string> = {
  '@amritk/niv/forms': '@amritk/runtime-validators',
  '@amritk/niv/query': '@tanstack/query-core',
  '@amritk/niv/vite': 'typescript',
}

/** The optional peers a consumer installs to use the subpaths above. */
const OPTIONAL_PEERS: Record<string, string> = {
  '@amritk/runtime-validators': '^0.9.0',
  '@tanstack/query-core': '^5.101.2',
  typescript: '^5',
}

const readManifest = async (path: string): Promise<Manifest> => JSON.parse(await readFile(path, 'utf-8')) as Manifest

/**
 * Every bare specifier the exports map offers a consumer **as a module**.
 * `./package.json` is data for a tool to read, not something to `import`.
 */
const declaredSubpaths = (pkg: Manifest): string[] =>
  Object.keys(pkg.exports ?? {})
    .filter((key) => !key.endsWith('.json'))
    .map((key) => (key === '.' ? pkg.name : `${pkg.name}/${key.slice('./'.length)}`))

/** Runs an ESM probe from inside a consumer project, so bare specifiers resolve as a consumer's would. */
const runProbe = async (consumerDir: string, name: string, source: string): Promise<string> => {
  const path = join(consumerDir, `${name}.mjs`)
  await writeFile(path, source, 'utf-8')
  const { stdout } = await runNode([path], { cwd: consumerDir })
  return stdout
}

describe('consumer-e2e', () => {
  let workDir: string
  /** Installed with nothing but the tarball: the no-optional-peers consumer. */
  let bareDir: string
  /** The same install plus every optional peer, so the peer-backed subpaths resolve. */
  let fullDir: string
  let pkg: Manifest
  let subpaths: string[] = []

  beforeAll(async () => {
    workDir = await mkdtemp(join(tmpdir(), 'niv-consumer-'))
    const packDir = join(workDir, 'tarballs')
    bareDir = join(workDir, 'bare-app')
    fullDir = join(workDir, 'full-app')
    await mkdir(packDir, { recursive: true })
    await mkdir(bareDir, { recursive: true })
    await mkdir(fullDir, { recursive: true })

    if (!existsSync(join(ROOT, 'dist'))) {
      throw new Error('no dist/ directory — run `bun run build` before `bun run test:dist`.')
    }
    pkg = await readManifest(join(ROOT, 'package.json'))
    subpaths = declaredSubpaths(pkg)

    // `npm pack` runs no lifecycle script this package defines (`prepublishOnly`
    // is publish-only), so packing straight from the working tree leaves it as
    // it was.
    const { stdout } = await runCommand('npm', ['pack', '--pack-destination', packDir], { cwd: ROOT })
    const tarball = `file:${join(packDir, stdout.trim().split('\n').at(-1) ?? '')}`

    const writeConsumer = async (dir: string, name: string, extra: Record<string, string>): Promise<void> => {
      await writeFile(
        join(dir, 'package.json'),
        JSON.stringify({ name, private: true, type: 'module', dependencies: { [pkg.name]: tarball, ...extra } }),
        'utf-8',
      )
      await runCommand('npm', ['install', '--no-audit', '--no-fund', '--loglevel=error'], { cwd: dir })
    }

    // happy-dom gives the DOM probe a document without asking the package to ship one.
    await writeConsumer(bareDir, 'niv-bare-consumer', { 'happy-dom': '^20.0.0' })
    await writeConsumer(fullDir, 'niv-full-consumer', { 'happy-dom': '^20.0.0', ...OPTIONAL_PEERS })
  }, 240_000)

  afterAll(async () => {
    await rm(workDir, { recursive: true, force: true })
  })

  it('installs a manifest whose only dependency is the pinned alien-signals', async () => {
    const installed = await readManifest(join(bareDir, 'node_modules', pkg.name, 'package.json'))
    expect(installed.dependencies).toEqual(pkg.dependencies)
    for (const [dep, spec] of Object.entries(installed.dependencies ?? {})) {
      // npm understands neither protocol; one surviving here is an uninstallable tarball.
      expect(spec, `dependencies.${dep}`).not.toMatch(/^(catalog|workspace):/)
    }
  })

  it('resolves alien-signals to one installed copy', async () => {
    // Two copies of alien-signals means two signal graphs: an effect created
    // against one would never see a write made through the other.
    const installed = await readManifest(join(bareDir, 'node_modules/alien-signals/package.json'))
    expect(installed.version).toBe(pkg.dependencies?.['alien-signals'])
    expect(existsSync(join(bareDir, 'node_modules', pkg.name, 'node_modules/alien-signals'))).toBe(false)
  })

  it('ships src without a development condition that would resolve to it', async () => {
    const packageDir = join(bareDir, 'node_modules', pkg.name)
    // The package ships its sources for source maps and go-to-definition, and
    // that is exactly why no exports map may name a `development` condition: it
    // would point at real files in the tarball, so a bundler honouring it hands
    // a consumer raw TypeScript instead of the built JS.
    expect(existsSync(join(packageDir, 'src/index.ts'))).toBe(true)
    const installed = await readManifest(join(packageDir, 'package.json'))
    expect(JSON.stringify(installed.exports)).not.toContain('development')
  })

  it('ships only the package — no tests, scripts, playground or examples', async () => {
    const files = (await readdir(join(bareDir, 'node_modules', pkg.name), { recursive: true })).map((file) =>
      file.split('\\').join('/'),
    )
    expect(files.filter((file) => file.includes('.test.'))).toEqual([])
    // The repo root IS the package, so everything beside `src/` and `dist/` is
    // one missing `files` entry away from shipping.
    const topLevel = [...new Set(files.map((file) => file.split('/')[0]))].sort()
    expect(topLevel).toEqual(['AI.md', 'LICENSE', 'README.md', 'dist', 'package.json', 'src'])
  })

  it('resolves every declared export subpath from a consumer install', async () => {
    // A guard against this sweep going quiet if the exports map ever moves.
    expect(subpaths.length).toBeGreaterThan(8)
    const source = `
      const empty = []
      for (const specifier of ${JSON.stringify(subpaths)}) {
        const module = await import(specifier)
        if (Object.keys(module).length === 0) empty.push(specifier)
      }
      console.log(JSON.stringify(empty))
    `
    // An empty module here is a build that dropped its exports.
    expect(JSON.parse((await runProbe(fullDir, 'subpaths', source)).trim())).toEqual([])
  })

  it('imports the core entries with no optional peer installed', async () => {
    const peerless = subpaths.filter((specifier) => !(specifier in PEER_BACKED_SUBPATHS))
    expect(peerless.length).toBeGreaterThan(5)
    const source = `
      for (const specifier of ${JSON.stringify(peerless)}) await import(specifier)
      console.log('ok')
    `
    expect(await runProbe(bareDir, 'peerless', source)).toContain('ok')
  })

  it('names the optional peer when a peer-backed subpath is imported without it', async () => {
    // These subpaths import their peer statically, so in a project without it
    // they fail at resolution. Pinned here so the set cannot grow silently: a
    // new peer-backed import inside `.` or `/flow` would be a real regression.
    for (const [specifier, peer] of Object.entries(PEER_BACKED_SUBPATHS)) {
      expect(subpaths, `${specifier} is still declared`).toContain(specifier)
      const source = `await import('${specifier}')`
      await expect(runProbe(bareDir, `missing-peer-${peer.replace(/\W/g, '-')}`, source)).rejects.toThrow(peer)
    }
  })

  it('renders and updates a component from the installed tarball', async () => {
    const source = `
      import { Window } from 'happy-dom'

      const window = new Window()
      for (const key of ['document', 'Node', 'Element', 'HTMLElement', 'HTMLInputElement', 'HTMLSelectElement']) {
        globalThis[key] = window[key]
      }
      globalThis.window = window

      const { mount, signal } = await import('${pkg.name}')
      const { jsx } = await import('${pkg.name}/jsx-runtime')

      const count = signal(0)
      const container = document.createElement('div')
      const dispose = mount(container, () => jsx('p', { children: () => 'count ' + count() }))

      const check = (expected) => {
        if (container.textContent !== expected) {
          console.error('expected ' + expected + ', got ' + container.textContent)
          process.exit(1)
        }
      }

      check('count 0')
      // The binding has to survive the build, the pack, and the exports map for
      // this write to reach the DOM node.
      count(1)
      check('count 1')

      dispose()
      count(2)
      check('')
      console.log('ok')
    `
    expect(await runProbe(bareDir, 'dom', source)).toContain('ok')
  })
})
