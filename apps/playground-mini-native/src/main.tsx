import { mount, setEngine } from '@amritk/mini-native'

import { App } from './app'
import { createDomPapi } from './lib/dom-papi'
import './styles.css'

/**
 * The entry point, and the one file that knows this is a browser.
 *
 * On a device the equivalent is two lines and no shim at all:
 *
 * ```ts
 * import { renderPage } from '@amritk/mini-native'
 * renderPage(App)
 * ```
 *
 * — because there the Element PAPI is already injected as globals and the
 * engine calls `renderPage` itself. Here there is no engine, so the app
 * supplies one: `createDomPapi()` implements the same PAPI over the DOM.
 *
 * That is a smaller claim than the old DOM host made, and a more honest one.
 * The old host implemented a FRAMEWORK abstraction, so the browser and the
 * device were two peers and either could be the odd one out. This implements
 * the ENGINE's API, so the browser is explicitly emulating Lynx, and the
 * emulation is the thing that can be wrong. Lynx ships a real version of this —
 * `@lynx-js/web-platform` — which is what a production web build should use;
 * this one exists so the playground stays a static bundle you can open.
 */
const root = document.getElementById('app')
if (!root) throw new Error('#app is missing from index.html')

const engine = createDomPapi({ root })
setEngine(engine)

const page = engine.__GetPageElement?.()
if (!page) throw new Error('The DOM engine did not hand back a page element')

mount(page, App)
