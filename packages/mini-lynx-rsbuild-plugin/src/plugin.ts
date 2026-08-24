import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import type { RsbuildPlugin } from '@rsbuild/core'

import { MainThreadInfoPlugin } from './main-thread-info'

/**
 * Where the pre-encode chunks live. rspeedy's own convention, and the reason it
 * is spelled out rather than chosen: `@lynx-js/rspeedy` cleans `.rspeedy/` and
 * its `distPath.intermediate` default names the same directory, so a build that
 * put them anywhere else would leave them behind in `dist/`.
 */
const INTERMEDIATE = '.rspeedy'

/**
 * Everything that is not the main-thread chunk. The runtime wrapper wraps the
 * background chunk in the function signature the engine's `app-service.js`
 * loader calls; applying it to the main-thread chunk too would wrap code the
 * engine executes directly, and nothing would run.
 */
const NOT_MAIN_THREAD = /^(?!.*main-thread(?:\.[A-Fa-f0-9]*)?\.js$).*\.js$/

/** The environments a Lynx template is emitted for. rspeedy names its default `lynx`. */
const isLynxEnvironment = (name: string): boolean => name === 'lynx' || name.startsWith('lynx-')

export type PluginMiniLynxOptions = {
  /**
   * The module that runs in the **background** chunk — `NativeModules`,
   * `GlobalEventEmitter`, and the background half of
   * `@amritk/mini-lynx-native`.
   *
   * Defaults to a stub that installs nothing, because a Lynx template carries a
   * background chunk whether or not the app has anything to put in it.
   */
  background?: string
  /**
   * The Lynx engine version the template is encoded for. Must be one the app
   * you are loading it into can read: an Explorer older than the template
   * refuses it outright.
   *
   * @defaultValue `'3.2'`
   */
  targetSdkVersion?: string
}

/**
 * Builds a `@amritk/mini-lynx` app into a `.lynx.bundle` template.
 *
 * ## What it has to do, and why any of it is needed
 *
 * A Lynx template is not a bundle with an entry point. It is a container with
 * two code slots — a main-thread chunk the engine executes to build the first
 * screen, and a background chunk it loads as `/app-service.js` — plus the CSS,
 * compiled by the encoder rather than shipped as text. `@lynx-js/rspeedy`
 * builds the container; which code goes in which slot is the framework's to
 * say, and every framework says it in its own plugin. ReactLynx's is
 * `@lynx-js/react-rsbuild-plugin`, and it is where the two entries, the
 * template plugin and the encoder are wired together. There is no
 * framework-agnostic plugin underneath it to reuse — `@lynx-js/rsbuild-plugin`
 * is the dev server and the minifier split, not the template — so this is that
 * wiring, for a runtime that renders on the main thread and drives the Element
 * PAPI itself.
 *
 * Concretely, per entry:
 *
 * 1. **Two entries from one.** `source.entry.main` becomes `main__main-thread`
 *    (your app) and `main` (the background module), emitted to
 *    `.rspeedy/main/`. rspeedy's `source.entry` stays the app's, so the dev
 *    server's URLs and the QR code still name `main.lynx.bundle`.
 * 2. **`LynxTemplatePlugin`**, which collects those two chunks plus the CSS
 *    into one template, and **`LynxEncodePlugin`**, which encodes it.
 * 3. **The main-thread flag.** The encoder splits an entry's assets into the
 *    two slots by one `lynx:main-thread` flag on the asset — set for ReactLynx
 *    by its own webpack plugin, and by {@link MainThreadInfoPlugin} here.
 *    Without it every chunk looks like background code and the template has no
 *    first screen at all.
 * 4. **The runtime wrapper**, on the background chunk only, which is what makes
 *    it loadable by the engine's module system.
 * 5. **JSX**, pointed at `@amritk/mini-lynx` — the same line the app's
 *    `tsconfig.json` carries, applied to the build, so a consumer does not have
 *    to configure SWC by hand to get a runtime that is not React.
 *
 * ## Reload rather than hot update
 *
 * In `dev` the background chunk gets two more modules on the front:
 * `@lynx-js/webpack-dev-transport/client`, which opens the socket back to the
 * dev server, and `@rspack/core/hot/dev-server`, which listens for what comes
 * over it.
 *
 * Nothing here accepts a hot update, and nothing should. A hot update is a diff
 * applied to a live module graph, and this runtime has no such graph: a
 * component runs once and the tree it built is mutated by signals forever, so
 * there is no second render to re-run against a new module. An update with no
 * acceptor bubbles to the entry, fails to apply, and the dev-server module
 * reloads the page through the devtool instead — which is the correct outcome
 * and the one this runtime can support, because `renderPage` claims
 * `removeComponents` and tears the previous tree down on the way. Save a file,
 * the app on the device restarts.
 *
 * The reload itself is `Page.reload` over the devtool's CDP channel, so it
 * needs an Explorer (or host app) with the devtool enabled — the same thing
 * scanning a QR code needs.
 *
 * @example
 * ```ts
 * // lynx.config.ts
 * import { pluginQRCode } from '@lynx-js/qrcode-rsbuild-plugin'
 * import { defineConfig } from '@lynx-js/rspeedy'
 * import { pluginMiniLynx } from '@amritk/mini-lynx-rsbuild-plugin'
 *
 * export default defineConfig({
 *   source: { entry: { main: './src/main-thread.tsx' } },
 *   plugins: [
 *     pluginQRCode({ fullscreen: true }),
 *     pluginMiniLynx({ background: './src/background.ts' }),
 *   ],
 * })
 * ```
 */
export const pluginMiniLynx = (options: PluginMiniLynxOptions = {}): RsbuildPlugin => ({
  name: 'mini-lynx',

  setup(api) {
    const { background = backgroundStub(), targetSdkVersion = '3.2' } = options

    api.modifyRsbuildConfig((config, { mergeRsbuildConfig }) =>
      mergeRsbuildConfig(config, {
        tools: {
          swc: {
            jsc: { transform: { react: { runtime: 'automatic', importSource: '@amritk/mini-lynx' } } },
          },
        },
      }),
    )

    api.modifyBundlerChain(async (chain, { environment, isDev }) => {
      if (!isLynxEnvironment(environment.name)) return

      // Imported here rather than at the top of the file so that loading this
      // module costs nothing: `LynxEncodePlugin` opens a worker pool the moment
      // it is imported, and a plugin that is only ever read (a consumer's
      // smoke test, an editor) should not start one.
      const [{ LynxEncodePlugin, LynxTemplatePlugin }, { RuntimeWrapperWebpackPlugin }] = await Promise.all([
        import('@lynx-js/template-webpack-plugin'),
        import('@lynx-js/runtime-wrapper-webpack-plugin'),
      ])

      const entries = chain.entryPoints.entries() ?? {}
      const mainThreadChunks: string[] = []
      chain.entryPoints.clear()

      for (const [entryName, entryPoint] of Object.entries(entries)) {
        const imports = toImports(entryPoint.values())
        const mainThreadEntry = `${entryName}__main-thread`
        const mainThreadName = `${INTERMEDIATE}/${entryName}/main-thread.js`
        const backgroundName = `${INTERMEDIATE}/${entryName}/background.js`
        mainThreadChunks.push(mainThreadName)

        chain
          .entry(mainThreadEntry)
          .add({ import: imports, filename: mainThreadName })
          .end()
          // The background entry keeps the ORIGINAL entry name: it is the name
          // rspeedy's dev server, the QR code and the template filename are all
          // derived from, so renaming it would move the URL the device fetches.
          .entry(entryName)
          .add({ import: [background], filename: backgroundName })
          .when(isDev, (entry) => {
            // Both specifiers are aliased by rspeedy — the client to its own,
            // with the dev server's host, port and token already in the query,
            // and `hot/dev-server` to the Lynx build of it that reloads through
            // the devtool rather than through a `window` that is not there.
            // Which is why they are added by name and given no options here.
            if (environment.config.dev?.hmr !== false) {
              entry.prepend({ import: '@rspack/core/hot/dev-server' })
            }
            entry.prepend({ import: '@lynx-js/webpack-dev-transport/client' })
          })
          .end()
          .plugin(`mini-lynx:template-${entryName}`)
          .use(LynxTemplatePlugin, [
            {
              ...LynxTemplatePlugin.defaultOptions,
              // The engine's no-diff main-thread mode: the chunk builds the
              // element tree itself and the engine does not reconcile anything
              // behind it. It is what this runtime does, and ReactLynx's
              // setting for the same reason.
              dsl: 'react_nodiff',
              chunks: [mainThreadEntry, entryName],
              filename: `${entryName}.lynx.bundle`,
              intermediate: `${INTERMEDIATE}/${entryName}`,
              targetSdkVersion,
            },
          ])
          .end()
      }

      chain
        .plugin('mini-lynx:main-thread-info')
        .use(MainThreadInfoPlugin, [mainThreadChunks])
        .end()
        .plugin('mini-lynx:runtime-wrapper')
        .use(RuntimeWrapperWebpackPlugin, [{ targetSdkVersion, test: NOT_MAIN_THREAD }])
        .end()
        .plugin('mini-lynx:encode')
        .use(LynxEncodePlugin, [{ inlineScripts: true }])
        .end()
    })
  },
})

/**
 * An rsbuild entry is a list of strings, of descriptor objects, or of both, and
 * both chunks are built from the same list — so it is flattened once, here,
 * rather than at each of the two places that consume it.
 */
const toImports = (values: readonly unknown[]): string[] =>
  values.flatMap((value) => {
    if (typeof value === 'string') return [value]
    if (Array.isArray(value)) return toImports(value)
    const { import: entry } = value as { import: string | string[] }
    return Array.isArray(entry) ? entry : [entry]
  })

/**
 * The default background entry: the chunk a template carries whether or not the
 * app has anything to run there.
 *
 * Resolved as a path rather than as a bare specifier because the app's rspack
 * resolves it, and an app that installed this plugin as a build-time dependency
 * of a workspace may not have it in its own `node_modules`. The `.ts` fallback
 * is for this repository's own tests, which run the plugin from `src/`.
 */
const backgroundStub = (): string => {
  const built = fileURLToPath(new URL('./background-stub.js', import.meta.url))
  return existsSync(built) ? built : fileURLToPath(new URL('./background-stub.ts', import.meta.url))
}
