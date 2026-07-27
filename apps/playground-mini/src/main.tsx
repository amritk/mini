import { hotMount } from '@amritk/mini/hot'

import { App } from './app'
import './styles.css'

/**
 * The entry point, and the app's hot-update boundary.
 *
 * `hotMount` is `mount` plus a disposer registered against this module, so an
 * edit anywhere below swaps the tree instead of reloading the page. Both halves
 * are required: Vite scans module SOURCE for `import.meta.hot.accept(`, and a
 * runtime `accept` reached through a helper does not register — the
 * `acceptHotUpdates()` plugin in `vite.config.ts` appends that call to whichever
 * module calls `hotMount`. Without it this file still works, it just full-reloads.
 *
 * `import.meta.hot` is passed straight through rather than guarded with an
 * `if`: it is `undefined` in a production build, where `hotMount` is exactly
 * `mount`. Keep this file thin — it re-runs on every edit below it.
 */
const root = document.getElementById('app')
if (root === null) throw new Error('#app is missing from index.html')

hotMount(root, App, import.meta.hot)
