import { renderPage } from '@amritk/mini-lynx'

import { App } from './app'
import './styles.css'

/**
 * The main-thread chunk: what the engine executes to build the first screen.
 *
 * `renderPage` is the entry — it installs the global the engine calls once at
 * startup — so there is nothing to mount, no container to find, and no engine
 * to construct. On a device the Element PAPI is already there, injected as
 * globals before this file runs.
 *
 * The browser preview's equivalent is `src/preview/main.ts`, which has to build
 * an engine because a browser is not one. That file is the only difference
 * between the two targets.
 */
renderPage(App)
