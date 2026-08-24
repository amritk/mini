import { renderPage } from '@amritk/mini-lynx'

import { App } from './app'

/**
 * The device entry point, and the whole difference between the two targets.
 *
 * On a device the engine injects the Element PAPI as globals and calls a
 * `renderPage` global itself at startup, so this is the entire file: no engine
 * to construct, no container to find, no shim. `src/preview/main.ts` is the
 * browser's four-line equivalent.
 *
 * Nothing in this project bundles this file yet. Getting it onto a phone needs
 * a Lynx host app and a Lynx template bundle, neither of which a starter can
 * honestly pretend to have produced — README.md says what that path looks like.
 * It is here because it is the thing you are aiming at, and because it
 * type-checks: whatever `App` does that a device cannot do fails here.
 */
renderPage(App)
