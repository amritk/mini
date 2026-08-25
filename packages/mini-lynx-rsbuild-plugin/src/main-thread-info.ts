import type { Compiler } from '@rspack/core'

/**
 * Flags the main-thread chunks so the encoder puts them in the template's
 * main-thread slot.
 *
 * The encoder does not infer the split from entry names or filenames: it reads
 * one `lynx:main-thread` boolean off each asset's info and treats everything
 * without it as background code. ReactLynx sets it from its own webpack plugin,
 * which is the only reason that plugin is in the chain for a build that has no
 * React in it — so this is that one flag, and nothing else.
 *
 * A missing chunk is skipped rather than thrown on. The name is computed from
 * an entry this plugin's own configuration created, so a miss means the entry
 * produced no asset at all — a compilation that already failed, and one whose
 * real error is worth more than an invariant firing on top of it.
 */
export class MainThreadInfoPlugin {
  readonly #chunks: readonly string[]

  constructor(chunks: readonly string[]) {
    this.#chunks = chunks
  }

  apply(compiler: Compiler): void {
    const name = 'MainThreadInfoPlugin'
    compiler.hooks.thisCompilation.tap(name, (compilation) => {
      compilation.hooks.processAssets.tap(
        // ADDITIONAL is the first stage assets exist at, which puts the flag on
        // before the template plugin reads it and before any later stage can
        // rewrite the asset without carrying its info forward.
        { name, stage: compiler.webpack.Compilation.PROCESS_ASSETS_STAGE_ADDITIONAL },
        () => {
          for (const chunk of this.#chunks) {
            const asset = compilation.getAsset(chunk)
            if (!asset) continue
            compilation.updateAsset(asset.name, asset.source, { ...asset.info, 'lynx:main-thread': true })
          }
        },
      )
    })
  }
}
