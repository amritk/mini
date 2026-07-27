import { setHost } from '../../src/current-host'
import { createDomHost, domRoot } from '../../src/hosts/create-dom-host'
import { mount } from '../../src/mount'
import { createBenchmarkApp } from './main'

/**
 * Entry point for `index.html`, running the benchmark in a browser through the
 * DOM host.
 *
 * The host is installed before anything renders, which is the one boot-order
 * rule this runtime has — `createBenchmarkApp` builds elements, so it cannot run
 * first.
 *
 * The app itself is unchanged from the one the headless harness times: same
 * store, same rows, same vocabulary. The only thing that differs between a
 * wall-clock number here and one from `scripts/bench-reconciler.ts` is which
 * host is installed, which is as close as this package gets to a controlled
 * experiment on what a platform costs.
 *
 * Run with a bundler that resolves the workspace — `npx vite` from this
 * directory (see README).
 */
setHost(createDomHost())

const container = document.getElementById('main')
if (container) {
  const app = createBenchmarkApp()
  mount(domRoot(container), () => app.element)
}
