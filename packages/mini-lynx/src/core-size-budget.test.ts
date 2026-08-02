/// <reference types="node" />
// Needs Node's zlib/url to bundle and gzip the core; pulled in explicitly
// because the package's tsconfig is deliberately platform-free (`lib:
// ["ESNext"]`, `types: []`) to keep the shipped sources off both the DOM and
// the Node ambient types.

import { fileURLToPath } from 'node:url'
import { gzipSync } from 'node:zlib'
import { build } from 'esbuild'
import { describe, expect, it } from 'vitest'

/**
 * The number behind "the core carries no platform", made checkable.
 *
 * An app imports the `.` entry and gets the whole runtime, so the size of that
 * entry — bundled and gzipped the way a consumer actually ships it — is what
 * every caller pays before rendering a single view. This bundles the core
 * through esbuild with a metafile and asserts two things: the gzipped size
 * stays under budget, and the built module graph contains only core sources and
 * `alien-signals`. Import a subpath into core and this fails on both counts.
 *
 * The bundle is built for the `neutral` platform, which is the honest setting
 * for a runtime that targets none: nothing here may resolve through a browser
 * or Node field, and asking esbuild to assume either would quietly excuse it.
 *
 * The budget moved once, deliberately, when this package stopped being a
 * multi-platform runtime. The old core was small because it deferred every
 * platform call to a host that an app bundled as a SECOND entry — so the
 * honest comparison is the old core plus the old Lynx host, and against that
 * the runtime grew a few hundred bytes for things it did not have: the worklet
 * registry that makes a main-thread event handler possible without a compiler,
 * the per-element style bookkeeping that keeps `show` alive across a style
 * write, and the per-tag creator table.
 *
 * It moved a second time, by 350 bytes (5064 → 5414 measured), for the three
 * things an app cannot add from outside and should not have to:
 * `report-error.ts` and the guards at the boundaries the engine calls in on,
 * the event-transport seam that makes the one unverified engine assumption
 * replaceable rather than a fork, and `global-props.ts`, which claims a
 * lifecycle slot only one thing in the process may claim. Each pays for itself
 * on the day something goes wrong on a device, which is the only day any of
 * them runs.
 *
 * It moved a third time, by 110 bytes (5449 → 5559 measured), to buy back main
 * thread time in the paths every screen runs. Four of the five are lookup tables
 * for answers that depend on nothing but a string an app repeats on every
 * element — the event-prefix parse in `apply-prop.ts`, the CSS spelling in
 * `style/to-css-name.ts`, the unitless verdict in `style/to-style-text.ts` — and
 * the fifth is `add-event.ts` learning not to copy a handler set of one on every
 * delivered event. Together they cut about a quarter off the runtime's own cost
 * to build a thousand-row list, measured against an engine that does nothing but
 * keep the tree. That is a good trade at this altitude specifically because the
 * runtime is MAIN-THREAD: the work it saves is not work moved to a background
 * thread, it is work the frame no longer has to fit around.
 *
 * It stays snug against the measured size on purpose. `/flow` is several times
 * the headroom and `/testing` is a complete Element PAPI, so a real leak cannot
 * hide in it. Raise it only for a deliberate, reviewed change to the core.
 */

const PKG_ROOT = fileURLToPath(new URL('..', import.meta.url))

/** Gzipped-byte ceiling for the bundled `.` entry. */
const GZIP_BUDGET = 5560

/** Subpath directories whose sources must never enter the core graph. */
const SUBPATH_DIRS = ['flow/', 'composition/', 'router/', 'testing/', 'forms/', 'query/', 'bridge/']

const built = await build({
  entryPoints: ['src/index.ts'],
  absWorkingDir: PKG_ROOT,
  bundle: true,
  format: 'esm',
  minify: true,
  write: false,
  metafile: true,
  platform: 'neutral',
  target: 'es2022',
})

const inputs = Object.keys(built.metafile.inputs)

describe('core-size-budget', () => {
  it('produces exactly one non-empty output file', () => {
    // Guards the measurement itself: an empty output would gzip to a handful of
    // bytes and pass the budget green, silently disarming the whole safety net.
    expect(built.outputFiles).toHaveLength(1)
    expect(built.outputFiles[0]?.contents.length ?? 0).toBeGreaterThan(0)
  })

  it('stays under the gzipped byte budget', () => {
    const output = built.outputFiles[0]?.contents ?? new Uint8Array()
    const gzipped = gzipSync(output).length
    expect(gzipped).toBeLessThanOrEqual(GZIP_BUDGET)
  })

  it('bundles only core sources and alien-signals', () => {
    const offenders = inputs.filter((input) => {
      if (input.includes('alien-signals')) return false
      if (input.startsWith('src/') && !SUBPATH_DIRS.some((dir) => input.startsWith(`src/${dir}`))) return false
      return true
    })
    expect(offenders).toEqual([])
  })

  it('pulls in no other node_modules package', () => {
    // A real assertion in both directions: every node_modules input must be
    // alien-signals, so a non-alien dependency shows up as a non-empty offenders
    // list rather than an empty loop that can only fail, never meaningfully pass.
    const foreign = inputs.filter((input) => input.includes('node_modules') && !input.includes('alien-signals'))
    expect(foreign).toEqual([])
  })
})
