import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import { ROOT } from './e2e-helpers'
import { DEP_FIELDS, type PackageJson, resolveCatalog, resolveProtocols, resolveWorkspace } from './workspace-protocol'

/**
 * Covers the resolver the release runs (`scripts/resolve-workspace-protocol.ts`)
 * before `changeset publish`, plus the state of this repo's real manifests.
 * npm understands neither `workspace:` nor `catalog:`, so a specifier that
 * survives this step ships literally and every consumer install of that package
 * fails — the kind of break nothing else in the pipeline would notice until it
 * was already on npm.
 */

const PACKAGES_DIR = join(ROOT, 'packages')

const readManifest = async (path: string): Promise<PackageJson> =>
  JSON.parse(await readFile(path, 'utf-8')) as PackageJson

/** Every workspace package manifest, keyed by its directory name. */
const workspaceManifests = async (): Promise<{ dir: string; pkg: PackageJson }[]> => {
  const found: { dir: string; pkg: PackageJson }[] = []
  for (const entry of await readdir(PACKAGES_DIR, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    found.push({ dir: entry.name, pkg: await readManifest(join(PACKAGES_DIR, entry.name, 'package.json')) })
  }
  return found
}

describe('workspace-protocol', () => {
  it('resolves the bare and wildcard workspace forms to the exact version', () => {
    expect(resolveWorkspace('workspace:', '1.2.3')).toBe('1.2.3')
    expect(resolveWorkspace('workspace:*', '1.2.3')).toBe('1.2.3')
  })

  it('keeps the range operator when the workspace spec carries one', () => {
    expect(resolveWorkspace('workspace:^', '1.2.3')).toBe('^1.2.3')
    expect(resolveWorkspace('workspace:~', '1.2.3')).toBe('~1.2.3')
  })

  it('preserves an explicit range over the workspace version', () => {
    expect(resolveWorkspace('workspace:^2.0.0', '1.2.3')).toBe('^2.0.0')
  })

  it('resolves a bare catalog: specifier from the root catalog', () => {
    const root: PackageJson = { catalog: { 'alien-signals': '3.2.1' } }
    expect(resolveCatalog('catalog:', 'alien-signals', root)).toBe('3.2.1')
  })

  it('resolves a named catalog: specifier from the matching named catalog', () => {
    const root: PackageJson = {
      catalog: { 'alien-signals': '3.2.1' },
      catalogs: { next: { 'alien-signals': '4.0.0' } },
    }
    expect(resolveCatalog('catalog:next', 'alien-signals', root)).toBe('4.0.0')
  })

  it('throws for a catalog entry that does not exist', () => {
    expect(() => resolveCatalog('catalog:', 'alien-signals', {})).toThrow(/No catalog entry for "alien-signals"/)
  })

  it('throws for a named catalog that does not exist', () => {
    // A `catalog:<name>` pointing at nothing used to fall through both branches
    // and ship literally, so this failure has to be loud.
    const root: PackageJson = { catalog: { 'alien-signals': '3.2.1' } }
    expect(() => resolveCatalog('catalog:next', 'alien-signals', root)).toThrow(/No catalog "next" entry/)
  })

  it('rewrites every dependency field of a manifest in place', () => {
    const pkg: PackageJson = {
      name: '@amritk/mini',
      dependencies: { 'alien-signals': 'catalog:' },
      devDependencies: { '@amritk/mini-native': 'workspace:*' },
      peerDependencies: { '@amritk/mini-native': 'workspace:^' },
      optionalDependencies: { 'alien-signals': 'catalog:' },
    }
    const changed = resolveProtocols(pkg, new Map([['@amritk/mini-native', '0.4.0']]), {
      catalog: { 'alien-signals': '3.2.1' },
    })

    expect(changed).toBe(true)
    expect(pkg.dependencies).toEqual({ 'alien-signals': '3.2.1' })
    expect(pkg.devDependencies).toEqual({ '@amritk/mini-native': '0.4.0' })
    expect(pkg.peerDependencies).toEqual({ '@amritk/mini-native': '^0.4.0' })
    expect(pkg.optionalDependencies).toEqual({ 'alien-signals': '3.2.1' })
  })

  it('leaves ordinary ranges untouched and reports no change', () => {
    const pkg: PackageJson = { dependencies: { 'alien-signals': '^3.2.0' }, peerDependencies: { typescript: '^5' } }
    expect(resolveProtocols(pkg, new Map(), {})).toBe(false)
    expect(pkg.dependencies).toEqual({ 'alien-signals': '^3.2.0' })
    expect(pkg.peerDependencies).toEqual({ typescript: '^5' })
  })

  it('throws for a workspace: dependency on a package that is not in the workspace', () => {
    const pkg: PackageJson = { dependencies: { '@amritk/gone': 'workspace:*' } }
    expect(() => resolveProtocols(pkg, new Map(), {})).toThrow(/No workspace version found for "@amritk\/gone"/)
  })

  it('resolves every specifier in this repo, so a publish emits installable manifests', async () => {
    const root = await readManifest(join(ROOT, 'package.json'))
    const manifests = await workspaceManifests()
    const versions = new Map(
      manifests.flatMap(({ pkg }) => (pkg.name && pkg.version ? [[pkg.name, pkg.version] as const] : [])),
    )

    for (const { dir, pkg } of manifests) {
      // Throws on an unknown catalog entry or workspace name, which is the
      // point: this is the same call the release makes.
      expect(() => resolveProtocols(pkg, versions, root), `${dir} resolves`).not.toThrow()
      for (const field of DEP_FIELDS) {
        for (const [name, spec] of Object.entries(pkg[field] ?? {})) {
          expect(spec, `${dir} ${field}.${name}`).not.toMatch(/^(catalog|workspace):/)
        }
      }
    }
  })

  it('pins every runtime dependency shared by both packages to a single version', async () => {
    // alien-signals is the reactive core of both packages; two manifests free
    // to pin it separately is how a consumer ends up with two copies of the
    // signal graph, where an effect created by one never sees the other's
    // writes. The catalog is what makes that drift impossible.
    const manifests = await workspaceManifests()
    const workspaceNames = new Set(manifests.flatMap(({ pkg }) => (pkg.name ? [pkg.name] : [])))
    const seen = new Map<string, string[]>()
    for (const { dir, pkg } of manifests) {
      for (const name of Object.keys(pkg.dependencies ?? {})) seen.set(name, [...(seen.get(name) ?? []), dir])
    }

    for (const [name, dirs] of seen) {
      if (dirs.length < 2) continue
      // A workspace sibling — `@amritk/mini-helpers` — is pinned with
      // `workspace:*` instead, and that is the stronger guarantee rather than a
      // loophole. The catalog makes two dependents agree on a range they each
      // copy; `workspace:*` resolves at publish time to the exact version going
      // out in the same run, so there is no range for them to disagree about.
      const expected = workspaceNames.has(name) ? 'workspace:*' : 'catalog:'
      for (const dir of dirs) {
        const pkg = manifests.find((entry) => entry.dir === dir)?.pkg
        expect(pkg?.dependencies?.[name], `${dir} pins ${name} with ${expected}`).toBe(expected)
      }
    }
  })

  it('keeps the root catalog free of entries nothing depends on', async () => {
    const root = await readManifest(join(ROOT, 'package.json'))
    const manifests = await workspaceManifests()
    const referenced = new Set(
      manifests.flatMap(({ pkg }) =>
        DEP_FIELDS.flatMap((field) =>
          Object.entries(pkg[field] ?? {})
            .filter(([, spec]) => spec.startsWith('catalog:'))
            .map(([name]) => name),
        ),
      ),
    )

    // A catalog entry no package points at is dead config that quietly stops
    // matching the version actually installed.
    expect(Object.keys(root.catalog ?? {}).sort()).toEqual([...referenced].sort())
  })
})
