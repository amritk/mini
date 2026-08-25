import { readFile, rm } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createContext, runInContext } from 'node:vm'
import { createFakeEngine, serializeTree } from '@amritk/mini-lynx/testing'
import { createRspeedy } from '@lynx-js/rspeedy'
import type { RsbuildPlugin } from '@rsbuild/core'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { pluginMiniLynx } from './plugin'

/**
 * The build, end to end, against the artifact a device would be handed.
 *
 * Everything else about this package is a matter of shaping a config object,
 * and a test that asserted on the shape would pass just as happily against a
 * config the encoder rejects. What the encoder actually needs — which chunk
 * carries the first screen, which one the module loader wraps, whether the CSS
 * survived — is only visible in the template it produces, so that is what this
 * reads: one real rspeedy build of a real app, then its output.
 *
 * The main-thread half goes further and is the point of the file. The chunk is
 * pulled out of the encoder's input and run against `createFakeEngine`, which
 * is a complete Element PAPI, so the assertions below are about what the built
 * bundle renders rather than about what it contains. A JSX transform pointed at
 * React, a runtime wrapper applied to the wrong chunk, a `renderPage` that
 * never reached the global — each is a passing string search and a blank screen
 * on the phone, and each fails here.
 *
 * What it cannot answer: whether the engine agrees. Layout, the devtool
 * connection, the reload the dev client asks the devtool for, and whether
 * Explorer accepts this `targetSdkVersion` are all device questions. See
 * `docs/mini-lynx-explorer.md` for what was checked on hardware and what was
 * not.
 */

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, '../../..')
const FIXTURE = resolve(HERE, '../fixture')

/**
 * What the encoder was handed, read at the moment it was handed it.
 *
 * A snapshot rather than a reference to the hook's own object: the encoder
 * rewrites that object in place on its way to the binary — `lepusCode.root`
 * goes from an asset to the string inside it — so anything held across the
 * build describes the encoder's output and not its input.
 */
type EncodeSnapshot = {
  mainThread: string
  manifest: Record<string, string>
  cssChunkCount: number
}

/**
 * Reads the encoder's input on its way past.
 *
 * The template plugin's `beforeEncode` hook is the last place the two chunks
 * exist as separate, readable assets: `LynxEncodePlugin` turns them into one
 * binary and deletes them. Tapping it is how a test gets the main-thread source
 * to run, and it is the same hook ReactLynx uses to append its worklet runtime,
 * so nothing here is reaching around the plugin's back.
 */
const captureEncodeData = (into: { current?: EncodeSnapshot }): RsbuildPlugin => ({
  name: 'capture-encode-data',
  setup(api) {
    api.modifyBundlerChain((chain) => {
      chain.plugin('capture-encode-data').use({
        apply: (compiler: {
          hooks: { thisCompilation: { tap: (name: string, fn: (compilation: unknown) => void) => void } }
        }) => {
          compiler.hooks.thisCompilation.tap('capture-encode-data', async (compilation) => {
            const { LynxTemplatePlugin } = await import('@lynx-js/template-webpack-plugin')
            LynxTemplatePlugin.getLynxTemplatePluginHooks(compilation as never).beforeEncode.tap(
              'capture-encode-data',
              (args) => {
                const { css, lepusCode, manifest } = args.encodeData
                into.current = {
                  mainThread: String(lepusCode.root?.source.source() ?? ''),
                  manifest: { ...manifest },
                  cssChunkCount: css.chunks.length,
                }
                return args
              },
            )
          })
        },
      })
    })
  },
})

/**
 * Runs the built main-thread chunk the way the engine does: as a script, in a
 * context whose globals are the Element PAPI, with nothing imported.
 *
 * That is the whole contract between a Lynx bundle and the main thread — the
 * chunk defines `renderPage` on the global object and the engine calls it once
 * — so a context with the fake engine's functions on it is the same shape a
 * device presents, minus a screen.
 */
const renderInFakeEngine = (mainThreadSource: string) => {
  const engine = createFakeEngine()
  const lifecycle: { type: string }[] = []
  const context = createContext({
    ...(engine.api as unknown as Record<string, unknown>),
    console,
    __OnLifecycleEvent: (event: { type: string }) => void lifecycle.push(event),
  })
  // The chunk is an IIFE that assigns the globals; the engine then calls the
  // one it cares about.
  runInContext(mainThreadSource, context)
  runInContext('renderPage()', context)

  // An event reaches a handler through `runWorklet`, which the bundle installs
  // on ITS global — and the fake engine, running out here, looks for the same
  // name on this one. On a device there is a single global object and the two
  // are the same; a `vm` context is the only reason they are not, so the seam
  // is closed rather than worked around.
  const outer = globalThis as { runWorklet?: unknown }
  outer.runWorklet = (context as { runWorklet?: unknown }).runWorklet

  return { engine, lifecycle }
}

/**
 * One real rspeedy build of `fixture/`, into a directory of its own so two
 * builds in this file cannot read each other's output.
 *
 * The runtime resolves to its **source**, like every other suite here, so a
 * test is never downstream of `bun run build`. rspack resolves its own graph and
 * knows nothing about vitest's aliases, so the same mapping is spelled again for
 * it.
 */
const buildFixture = async (
  distRoot: string,
  options: Parameters<typeof pluginMiniLynx>[0],
): Promise<{ template: Buffer; captured: { current?: EncodeSnapshot } }> => {
  const captured: { current?: EncodeSnapshot } = {}
  const rspeedy = await createRspeedy({
    cwd: FIXTURE,
    rspeedyConfig: {
      plugins: [pluginMiniLynx(options), captureEncodeData(captured)],
      output: { distPath: { root: distRoot } },
      source: {
        entry: { main: './src/main-thread.tsx' },
        alias: {
          '@amritk/mini-lynx/jsx-runtime': resolve(ROOT, 'packages/mini-lynx/src/jsx-runtime.ts'),
          '@amritk/mini-lynx/jsx-dev-runtime': resolve(ROOT, 'packages/mini-lynx/src/jsx-dev-runtime.ts'),
          '@amritk/mini-lynx': resolve(ROOT, 'packages/mini-lynx/src/index.ts'),
          '@amritk/mini-lynx-native/background': resolve(ROOT, 'packages/mini-lynx-native/src/background/index.ts'),
        },
      },
    },
  })

  await rspeedy.build()
  return { template: await readFile(resolve(FIXTURE, distRoot, 'main.lynx.bundle')), captured }
}

describe('the rspeedy build', () => {
  let captured: { current?: EncodeSnapshot } = {}
  let template: Buffer

  beforeAll(async () => {
    const built = await buildFixture('dist', { background: './src/background.ts' })
    template = built.template
    captured = built.captured
  }, 120_000)

  afterAll(async () => {
    await rm(resolve(FIXTURE, 'dist'), { recursive: true, force: true })
  })

  it('emits one encoded template per entry', () => {
    // Not a size assertion dressed up: an encoder that produced an empty
    // container would still write a file, and the number is what says the two
    // chunks and the CSS are inside it.
    expect(template.byteLength).toBeGreaterThan(1_000)
  })

  it('fills both of the template’s code slots', () => {
    // The main-thread slot. Empty is the failure this package exists to avoid:
    // without the `lynx:main-thread` flag every chunk looks like background
    // code, the template encodes fine, and the app has no first screen — and
    // the encoder reports nothing, because a template without one is legal.
    expect(captured.current?.mainThread).toContain('renderPage')

    // The background slot. The encoder is handed it under its chunk name and
    // publishes it as `/app-service.js`, which is the name the engine's module
    // loader requires and therefore the one worth asserting on the artifact.
    expect(Object.keys(captured.current?.manifest ?? {})).toEqual(['.rspeedy/main/background.js'])
    expect(template.includes('/app-service.js')).toBe(true)
  })

  it('compiles the app’s CSS into the template rather than shipping it as text', () => {
    expect(captured.current?.cssChunkCount).toBeGreaterThan(0)
  })

  it('wraps the background chunk for the engine’s module loader, and not the main-thread one', () => {
    const mainThread = captured.current?.mainThread ?? ''
    const background = captured.current?.manifest['.rspeedy/main/background.js'] ?? ''

    // `tt.define` is the engine's module registration, and the wrapper around
    // the background chunk is what emits it. The main-thread chunk is executed
    // by the engine directly: the same wrapper around it would register a
    // module nobody requires, and the first screen would never be built.
    expect(background).toContain('.define(')
    // And the app's own background module is what is inside it: the bridge's
    // message prefix, which nothing else in the graph emits.
    expect(background).toContain('mini-lynx-native:')
    expect(mainThread).not.toContain('.define(')
  })

  it('renders the app when the engine calls renderPage', () => {
    const mainThread = captured.current?.mainThread ?? ''
    const { engine, lifecycle } = renderInFakeEngine(mainThread)

    expect(serializeTree(engine.page)).toMatchInlineSnapshot(`
      "<page>
        <view .card @tap>
          <text .title>
            <raw-text text="mini-lynx">
          <text .count>
            <raw-text text="tapped 0 times">"
    `)

    // The platform's cue to stop waiting. A bundle that renders and never sends
    // it is an app stuck on its splash screen, which is not a failure any
    // string search over the template would find.
    expect(lifecycle).toEqual([{ type: 'firstScreen' }])
  })

  it('keeps the built tree reactive, so a tap is not a re-render', () => {
    const mainThread = captured.current?.mainThread ?? ''
    const { engine } = renderInFakeEngine(mainThread)

    const view = engine.find('view')
    expect(view).toBeDefined()
    const before = engine.find('text')
    engine.dispatch(view as never, 'tap')

    expect(serializeTree(engine.page)).toContain('tapped 1 times')
    // The same element, mutated. A runtime that rebuilt the subtree would pass
    // the assertion above and fail this one, which is the difference this
    // package is here to preserve through a bundler.
    expect(engine.find('text')).toBe(before)
  })
})

describe('an app with no background module', () => {
  let captured: { current?: EncodeSnapshot } = {}
  let template: Buffer

  beforeAll(async () => {
    // No `background` option — the path a consumer takes before they have
    // anything native to reach for, and the one that has to keep producing a
    // valid template anyway.
    const built = await buildFixture('dist-stub', {})
    template = built.template
    captured = built.captured
  }, 120_000)

  afterAll(async () => {
    await rm(resolve(FIXTURE, 'dist-stub'), { recursive: true, force: true })
  })

  it('still fills the background slot, with the stub', () => {
    expect(template.includes('/app-service.js')).toBe(true)
    const background = captured.current?.manifest['.rspeedy/main/background.js'] ?? ''
    expect(background).toContain('.define(')
    // The app's own background module is what is NOT in it.
    expect(background).not.toContain('mini-lynx-native:')
  })

  it('renders the same first screen', () => {
    const { engine, lifecycle } = renderInFakeEngine(captured.current?.mainThread ?? '')

    expect(serializeTree(engine.page)).toContain('tapped 0 times')
    expect(lifecycle).toEqual([{ type: 'firstScreen' }])
  })
})
