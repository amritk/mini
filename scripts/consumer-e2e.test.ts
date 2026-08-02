import { existsSync } from 'node:fs'
import { cp, mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { ROOT, runCommand, runNode } from './e2e-helpers'
import { stripDevelopment } from './strip-development-exports'
import { type PackageJson, resolveProtocols } from './workspace-protocol'

/**
 * The npm consumer's path, end to end: pack both packages exactly the way
 * `release:publish` does — `catalog:`/`workspace:` specifiers resolved, the
 * `development` condition stripped — install the tarballs into scratch
 * projects, and drive them under plain Node.
 *
 * Nothing else in the pipeline sees this. The unit tests alias both packages
 * to their `src/`, and dist-smoke loads `dist/` by absolute path — so a broken
 * `files` list, an exports map that points at a file the tarball does not
 * carry, or a `catalog:` specifier that never got resolved all look perfectly
 * healthy right up until the first `npm install` of the published package.
 *
 * Requires a prior `bun run build`; run via `bun run test:dist`.
 */

type Manifest = PackageJson & { exports?: Record<string, unknown>; files?: string[] }

/**
 * Subpaths whose module graph statically reaches an optional peer, so they only
 * resolve once that peer is installed. Everything else must import with nothing
 * but the package itself — that is the promise `.` makes to the widget bundle.
 */
const PEER_BACKED_SUBPATHS: Record<string, string> = {
  '@amritk/mini/forms': '@amritk/runtime-validators',
  '@amritk/mini/query': '@tanstack/query-core',
  '@amritk/mini/vite': 'typescript',
  // The ports carry their siblings' peers across with them, which is the whole
  // point of the ports being ports. `mini-lynx` has no third peer of its own:
  // there is no `/vite` here, because the called-signal check is `@amritk/mini`'s
  // and is deliberately not duplicated.
  '@amritk/mini-lynx/forms': '@amritk/runtime-validators',
  '@amritk/mini-lynx/query': '@tanstack/query-core',
  // Both `/forms` entries above reach the validator THROUGH this one now: the
  // schema arm is the part of a form that never touches a control, so it is
  // shared rather than ported. `@amritk/mini-helpers`'s own `.` entry is
  // deliberately absent from this table — it has no dependency at all.
  '@amritk/mini-helpers/schema': '@amritk/runtime-validators',
}

/** The optional peers a consumer installs to use the subpaths above. */
const OPTIONAL_PEERS: Record<string, string> = {
  '@amritk/runtime-validators': '^0.9.0',
  '@tanstack/query-core': '^5.101.2',
  typescript: '^5',
}

/**
 * Every package the release publishes, **in sorted order** — the assertion
 * below compares it against a sorted list of what was actually packed, so a new
 * entry in the wrong position fails for a reason that has nothing to do with
 * packing.
 *
 * `@amritk/mini-helpers` is here because both runtimes depend on it at runtime,
 * so a consumer install that did not carry it would fail on the first `/router`
 * or `/forms` import; `@amritk/mini-lynx-native` is here for the same reason
 * relative to the four `lynx-*` native-module packages.
 */
const PUBLISHED = [
  '@amritk/lynx-deep-linking',
  '@amritk/lynx-dialogs',
  '@amritk/lynx-location',
  '@amritk/lynx-notifications',
  '@amritk/mini',
  '@amritk/mini-helpers',
  '@amritk/mini-lynx',
  '@amritk/mini-lynx-native',
] as const

/**
 * The packages that carry the shared reactive core, and therefore have to ship
 * the catalog-pinned version of it.
 *
 * `mini-helpers` is barred from importing signals at all, which is the charter
 * its own `purity.test.ts` enforces. The native-module packages are off it for a
 * related reason of their own: a second edge onto the signal engine is how a
 * consumer ends up with two reactive graphs that cannot see each other's
 * writes, so their surface is promises and subscriptions and an app wires those
 * into whichever graph it already has.
 */
const REACTIVE = ['@amritk/mini', '@amritk/mini-lynx'] as const

/**
 * The packages that depend on `@amritk/mini-helpers` at runtime.
 *
 * `@amritk/lynx-deep-linking` is the first that is not a runtime: `parseURL`
 * needs a query parser, one already exists here that is pure and platform-free,
 * and a second copy would be a second thing to keep correct.
 */
const SHARES_HELPERS = ['@amritk/lynx-deep-linking', '@amritk/mini', '@amritk/mini-lynx'] as const

/** The native-module packages, each of which reaches its platform half through the bridge. */
const USES_BRIDGE = [
  '@amritk/lynx-deep-linking',
  '@amritk/lynx-dialogs',
  '@amritk/lynx-location',
  '@amritk/lynx-notifications',
] as const

const PACKAGES_DIR = join(ROOT, 'packages')

const readManifest = async (path: string): Promise<Manifest> => JSON.parse(await readFile(path, 'utf-8')) as Manifest

/**
 * Every bare specifier a package's exports map offers a consumer **as a
 * module**.
 *
 * JSON exports are excluded, and not as a special case for `package.json`: an
 * exported `.json` is data for a tool to resolve and read — `lynx.lib.json` is
 * the native autolinker's manifest — rather than something any consumer
 * `import`s. Probing one only proves Node wants an import attribute for JSON,
 * which is true and says nothing about this package.
 */
const declaredSubpaths = (pkg: Manifest): string[] =>
  Object.keys(pkg.exports ?? {})
    .filter((key) => !key.endsWith('.json'))
    .map((key) => (key === '.' ? (pkg.name as string) : `${pkg.name}/${key.slice('./'.length)}`))

/** Runs an ESM probe from inside a consumer project, so bare specifiers resolve as a consumer's would. */
const runProbe = async (consumerDir: string, name: string, source: string): Promise<string> => {
  const path = join(consumerDir, `${name}.mjs`)
  await writeFile(path, source, 'utf-8')
  const { stdout } = await runNode([path], { cwd: consumerDir })
  return stdout
}

describe('consumer-e2e', () => {
  let workDir: string
  /** Installed with nothing but the tarballs: the no-optional-peers consumer. */
  let bareDir: string
  /** The same install plus every optional peer, so the peer-backed subpaths resolve. */
  let fullDir: string
  const subpaths: string[] = []
  let catalog: Record<string, string> = {}

  beforeAll(async () => {
    workDir = await mkdtemp(join(tmpdir(), 'mini-consumer-'))
    const packDir = join(workDir, 'tarballs')
    bareDir = join(workDir, 'bare-app')
    fullDir = join(workDir, 'full-app')
    await mkdir(packDir, { recursive: true })
    await mkdir(bareDir, { recursive: true })
    await mkdir(fullDir, { recursive: true })

    const rootPkg = await readManifest(join(ROOT, 'package.json'))
    catalog = rootPkg.catalog ?? {}

    const workspacePackages: { dir: string; pkg: Manifest }[] = []
    const versions = new Map<string, string>()
    for (const entry of await readdir(PACKAGES_DIR, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue
      const dir = join(PACKAGES_DIR, entry.name)
      const pkg = await readManifest(join(dir, 'package.json'))
      if (pkg.name && pkg.version) versions.set(pkg.name, pkg.version)
      workspacePackages.push({ dir, pkg })
    }

    const dependencies: Record<string, string> = {}
    for (const { dir, pkg } of workspacePackages) {
      if (pkg.private || !pkg.name) continue
      if (!existsSync(join(dir, 'dist'))) {
        throw new Error(`${pkg.name} has no dist/ directory — run \`bun run build\` before \`bun run test:dist\`.`)
      }

      // Pack from a copy: the release transforms rewrite package.json, and the
      // working tree must come out of this test exactly as it went in.
      const copyDir = join(workDir, 'pack-src', pkg.name.replace('/', '__'))
      await cp(dir, copyDir, { recursive: true, filter: (source) => !source.includes('node_modules') })
      resolveProtocols(pkg, versions, rootPkg)
      stripDevelopment(pkg.exports)
      await writeFile(join(copyDir, 'package.json'), `${JSON.stringify(pkg, null, 2)}\n`, 'utf-8')

      const { stdout } = await runCommand('npm', ['pack', '--pack-destination', packDir], { cwd: copyDir })
      dependencies[pkg.name] = `file:${join(packDir, stdout.trim().split('\n').at(-1) ?? '')}`
      subpaths.push(...declaredSubpaths(pkg))
    }
    expect(Object.keys(dependencies).sort()).toEqual([...PUBLISHED])

    // `overrides` forces every transitive @amritk/* edge onto our tarballs.
    // Without it the installer is free to satisfy one from the registry, which
    // is exactly how a corrupted published artifact would slip past this test.
    const writeConsumer = async (dir: string, name: string, extra: Record<string, string>): Promise<void> => {
      await writeFile(
        join(dir, 'package.json'),
        JSON.stringify({
          name,
          private: true,
          type: 'module',
          dependencies: { ...dependencies, ...extra },
          overrides: dependencies,
        }),
        'utf-8',
      )
      await runCommand('npm', ['install', '--no-audit', '--no-fund', '--loglevel=error'], { cwd: dir })
    }

    // happy-dom gives the DOM probes a document without asking mini to ship one.
    await writeConsumer(bareDir, 'mini-bare-consumer', { 'happy-dom': '^20.0.0' })
    await writeConsumer(fullDir, 'mini-full-consumer', { 'happy-dom': '^20.0.0', ...OPTIONAL_PEERS })
  }, 240_000)

  afterAll(async () => {
    await rm(workDir, { recursive: true, force: true })
  })

  it('installs manifests with every catalog: and workspace: specifier resolved', async () => {
    for (const name of PUBLISHED) {
      const pkg = await readManifest(join(bareDir, 'node_modules', name, 'package.json'))
      for (const field of ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies'] as const) {
        for (const [dep, spec] of Object.entries(pkg[field] ?? {})) {
          expect(spec, `${name} ${field}.${dep}`).not.toMatch(/^(catalog|workspace):/)
        }
      }
      // The catalog is the single source of truth for the shared reactive core,
      // so what ships has to be the version the catalog pins — and a package
      // that is meant to stay off signals has to still be off them.
      if ((REACTIVE as readonly string[]).includes(name)) {
        expect(pkg.dependencies?.['alien-signals'], `${name} alien-signals`).toBe(catalog['alien-signals'])
      } else {
        expect(pkg.dependencies?.['alien-signals'], `${name} alien-signals`).toBeUndefined()
      }
      // The `workspace:*` edge onto mini-helpers has to come out as the concrete
      // version being published alongside it, or the tarball is uninstallable.
      if ((SHARES_HELPERS as readonly string[]).includes(name)) {
        const shared = await readManifest(join(bareDir, 'node_modules/@amritk/mini-helpers/package.json'))
        expect(pkg.dependencies?.['@amritk/mini-helpers'], `${name} @amritk/mini-helpers`).toBe(shared.version)
      }
      // Same rule one level up: a native-module package's `workspace:*` edge
      // onto the bridge has to resolve to a concrete version too.
      if ((USES_BRIDGE as readonly string[]).includes(name)) {
        const bridge = await readManifest(join(bareDir, 'node_modules/@amritk/mini-lynx-native/package.json'))
        expect(pkg.dependencies?.['@amritk/mini-lynx-native'], `${name} @amritk/mini-lynx-native`).toBe(bridge.version)
      }
    }
  })

  it('resolves the catalog-pinned alien-signals to one installed copy', async () => {
    // Two copies of alien-signals means two signal graphs: an effect created
    // through mini would never see a write made through mini-lynx.
    const installed = await readManifest(join(bareDir, 'node_modules/alien-signals/package.json'))
    expect(installed.version).toBe(catalog['alien-signals'])
    expect(existsSync(join(bareDir, 'node_modules/@amritk/mini/node_modules/alien-signals'))).toBe(false)
    expect(existsSync(join(bareDir, 'node_modules/@amritk/mini-lynx/node_modules/alien-signals'))).toBe(false)
  })

  it('ships src without a development condition that would resolve to it', async () => {
    for (const name of PUBLISHED) {
      const packageDir = join(bareDir, 'node_modules', name)
      // Every package ships its sources for source maps and go-to-definition,
      // which is precisely why the condition must be gone: it points at real
      // files in the tarball, so a bundler honouring `development` would hand a
      // consumer raw TypeScript instead of the built JS.
      expect(existsSync(join(packageDir, 'src/index.ts')), `${name} ships src`).toBe(true)
      const pkg = await readManifest(join(packageDir, 'package.json'))
      expect(JSON.stringify(pkg.exports), `${name} exports`).not.toContain('development')
    }
  })

  it('keeps test files out of the published tarballs', async () => {
    for (const name of PUBLISHED) {
      const packageDir = join(bareDir, 'node_modules', name)
      const files = await readdir(packageDir, { recursive: true })
      expect(
        files.filter((file) => file.includes('.test.')),
        `${name} tarball`,
      ).toEqual([])
    }
  })

  it('resolves every declared export subpath from a consumer install', async () => {
    // A guard against this sweep going quiet if the exports maps ever move.
    expect(subpaths.length).toBeGreaterThan(15)
    const source = `
      const empty = []
      for (const specifier of ${JSON.stringify(subpaths)}) {
        const module = await import(specifier)
        if (Object.keys(module).length === 0) empty.push(specifier)
      }
      console.log(JSON.stringify(empty))
    `
    const empty = JSON.parse((await runProbe(fullDir, 'subpaths', source)).trim()) as string[]
    // Every entry ships something at runtime now. `mini-lynx/host` used to be
    // the one exception — a renderer contract that was types only — and it went
    // with the `Host` abstraction: `/engine` replaced it and exports real
    // functions. An empty module here is a build that dropped its exports.
    expect(empty).toEqual([])
  })

  it('imports the core entries with no optional peer installed', async () => {
    const peerless = subpaths.filter((specifier) => !(specifier in PEER_BACKED_SUBPATHS))
    expect(peerless.length).toBeGreaterThan(12)
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

  it('renders and updates a mini component from the installed tarball', async () => {
    const source = `
      import { Window } from 'happy-dom'

      const window = new Window()
      for (const key of ['document', 'Node', 'Element', 'HTMLElement', 'HTMLInputElement', 'HTMLSelectElement']) {
        globalThis[key] = window[key]
      }
      globalThis.window = window

      const { mount, signal } = await import('@amritk/mini')
      const { jsx } = await import('@amritk/mini/jsx-runtime')

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
    expect(await runProbe(bareDir, 'mini-dom', source)).toContain('ok')
  })

  it('drives mini-lynx through its fake engine from the installed tarball', async () => {
    const source = `
      const { bindText, createElement, createRawText, insert, mount, setEngine, signal } =
        await import('@amritk/mini-lynx')
      const { createFakeEngine, serializeTree } = await import('@amritk/mini-lynx/testing')

      const engine = createFakeEngine()
      setEngine(engine.api)

      const label = signal('first')
      mount(engine.pageElement, () => {
        const item = createElement('text')
        const text = createRawText('')
        bindText(text, label)
        insert(item, text, null)
        return item
      })

      const check = (expected) => {
        const tree = serializeTree(engine.page)
        if (!tree.includes(expected)) {
          console.error('expected ' + expected + ' in\\n' + tree)
          process.exit(1)
        }
      }

      check('first')
      label('second')
      check('second')
      console.log('ok')
    `
    expect(await runProbe(bareDir, 'native-memory', source)).toContain('ok')
  })
})
