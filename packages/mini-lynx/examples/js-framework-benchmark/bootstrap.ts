import { renderPage } from '../../src/entry'
import { createBenchmarkApp } from './main'

/**
 * The main-thread entry point, for running the benchmark on a device.
 *
 * A Lynx bundle's contract with its main-thread chunk is one global —
 * `renderPage`, which the engine calls exactly once at startup — so this is the
 * whole of it. `renderPage` from the runtime installs the injected engine, mounts
 * into the page element the engine already owns, and emits the `firstScreen`
 * lifecycle event the platform waits for.
 *
 * The app itself is unchanged from the one a headless harness times: same store,
 * same rows, same tags. The only thing that differs between a wall-clock number
 * here and one from a fake engine is which engine is installed, which is as close
 * as this package gets to a controlled experiment on what the platform costs.
 *
 * There is deliberately no browser entry any more. The DOM host is gone — Lynx
 * already renders to the web, one layer down, and a second web target maintained
 * here would be the divergence this package removed itself to avoid.
 */
renderPage(() => createBenchmarkApp().element)
