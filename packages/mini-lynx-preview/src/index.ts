/**
 * `@amritk/mini-lynx-preview` — Lynx's Element PAPI over the DOM.
 *
 * A `@amritk/mini-lynx` app talks to one thing: about thirty engine functions
 * that a device injects as globals. Nothing else about the app is native, so
 * supplying those functions from a browser is enough to run it in a tab — the
 * runtime above the boundary is the code that ships to a device, byte for byte,
 * exercising the same creators, attribute names and worklet dispatch.
 *
 * ```ts
 * import { mount, pageElement, setEngine } from '@amritk/mini-lynx'
 * import { createDomPapi } from '@amritk/mini-lynx-preview'
 *
 * setEngine(createDomPapi({ root: document.getElementById('app') ?? undefined }))
 * mount(pageElement(), App)
 * ```
 *
 * That is the whole integration, and it is deliberately the app's three lines
 * rather than one of ours: this package holds no reference to the runtime at
 * all — it imports `@amritk/mini-lynx` for **types only** — so there is no way
 * for a preview to call `setEngine` on a second copy of the runtime and leave
 * the app's copy with no engine at all. On a device the same entry is
 * `renderPage(App)` and the engine is already there.
 *
 * ## What a preview is, and what it is not
 *
 * The relationship is not symmetric: **the browser is emulating Lynx**, so when
 * the two disagree the preview is what is wrong. Four things it is structurally
 * blind to, each documented where it happens in `dom-papi.ts`:
 *
 * - **Missing flushes.** The DOM is eager, so `__FlushElementTree` is a no-op
 *   and a mutation that never gets committed still appears.
 * - **Element creation.** On a device `__CreateElement('view')` builds a node
 *   that is not really a view; in a browser every tag is a custom element and
 *   the distinction does not exist. The engine's own web port has the same
 *   blind spot.
 * - **Layout.** Linear is approximated with flex; `linear-weight` and the
 *   `relative-*` family have no CSS equivalent at all.
 * - **The background thread.** A string listener has nowhere to route to, so it
 *   is reported rather than delivered.
 *
 * Lynx ships a real, complete version of this idea — `@lynx-js/web-platform`,
 * where `web-core` reimplements the PAPI over custom elements — and that is
 * what a production web build should use. This is a small, honest subset,
 * sized for a dev loop.
 */

export { createDomPapi, type DomPapiOptions } from './dom-papi'
export { installLynxReset, LYNX_ROOT_ATTRIBUTE } from './install-lynx-reset'
export { createVisualViewportEmitter } from './visual-viewport-keyboard'
