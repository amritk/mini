import { mount, setEngine } from '@amritk/mini-lynx'
import { trackKeyboard } from '@amritk/mini-lynx/keyboard'

import { App } from './app'
import { createDomPapi } from './lib/dom-papi'
import { nativeRoot } from './lib/native-root'
import { createVisualViewportEmitter } from './lib/visual-viewport-keyboard'
import './styles.css'

/**
 * The entry point, and the one file that knows this is a browser.
 *
 * On a device the equivalent is two lines and no shim at all:
 *
 * ```ts
 * import { renderPage } from '@amritk/mini-lynx'
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

// On a device this is `trackKeyboard()` with no argument — the engine's own
// `GlobalEventEmitter` is the default source. Lynx does not emit
// `keyboardstatuschanged` on the web, so the browser reports the keyboard from
// `visualViewport` instead and everything above the height is the same code.
trackKeyboard({ emitter: createVisualViewportEmitter() })

// The native side, before the first render rather than after it. On a device
// this line is `installNativeBridge()` in the BACKGROUND chunk and the two
// root subscriptions are in the root component; here `nativeRoot()` installs
// the preview's stand-in device (`lib/fake-device.ts`) and then makes those
// same two subscriptions.
//
// Its being first is the part that carries over. A link or a notification tap
// that arrived before the app was running is held natively and replayed once,
// to whoever subscribes first — so anything that subscribes after the first
// screen is up is subscribing after the replay has already happened.
nativeRoot()

const page = engine.__GetPageElement?.()
if (!page) throw new Error('The DOM engine did not hand back a page element')

mount(page, App)
