/**
 * The stylesheet that makes a browser lay out like Yoga.
 *
 * This is the piece that decides whether write-once is true or a slogan. Every
 * other part of the cross-platform story is additive — new props, new optional
 * host fields — and none of it matters if the two targets disagree about what
 * an element IS before a single declaration is written. They do:
 *
 * | | Native (Yoga) | Web (CSS) |
 * | --- | --- | --- |
 * | `display` | always flex | `block` |
 * | `flexDirection` | `column` | `row` |
 * | `position` | `relative` | `static` |
 * | `flexShrink` | `0` | `1` |
 * | `minWidth` / `minHeight` on a flex item | `0` | `auto` |
 * | text properties | do not inherit through a container | inherit |
 *
 * An unstyled container with two children stacks vertically on a device and
 * horizontally on the web, and a `<button>` arrives wearing a system look no
 * native target has. Neither is cosmetic — they are the difference between a
 * component tree that runs on both and one that has to be adjusted per target,
 * which is the whole thing this package is for.
 *
 * ## Three decisions worth knowing
 *
 * **Zero specificity.** Every rule is wrapped in `:where()`, so the reset never
 * wins an argument with the app. A single class, a `style` prop, anything at
 * all overrides it without `!important` and without counting selectors. A reset
 * that fights the code above it is a reset people work around.
 *
 * **Scoped by attribute, not globally.** Only elements this host built carry
 * `data-mn`, so an app embedding this runtime beside other markup does not have
 * its own page reset out from under it. The cost is one attribute per element,
 * which is nothing next to creating the element.
 *
 * **Text inheritance stops at a container**, matching Yoga rather than CSS. On
 * a device a `text` nested in a styled container inherits nothing while a
 * `text` nested in another `text` inherits everything, so a colour set on a
 * container reaches its text on the web and silently does not on the device.
 * Picking the strict target's semantics is the same call `ContainerChildren`
 * already makes: be strict where the strict target is, so the permissive one
 * cannot hide a bug. The base it re-asserts is a custom property, so an app
 * that wants a different base font sets `--mn-font` once rather than fighting
 * this file.
 *
 * ## What it deliberately does not do
 *
 * It does not clip overflow. Yoga's historic default is to clip and CSS's is
 * not, so this looks like an obvious entry in the table above — but the two
 * native platforms do not agree with each other either, and clipping every
 * container on the web would silently break shadows, focus rings, and every
 * absolutely-positioned popover that is not in a `Portal`. That is a large
 * behavioural claim to make on an app's behalf in order to close a divergence
 * that shows up as a visual difference rather than as a broken screen. It is
 * left to the app, and named here so it is a decision rather than an oversight.
 */

/** The `id` the stylesheet is installed under, so a second host does not add a second copy. */
const STYLE_ID = 'mini-native-reset'

/** Marks an element as one this host built, and therefore as one the reset applies to. */
export const RESET_MARKER = 'data-mn'

/**
 * Marks an element as a CONTAINER — everything except a text run.
 *
 * This is what implements "inheritance stops at a container": the base text
 * properties are re-asserted here, so they do not flow down from whatever the
 * container happens to sit inside.
 */
export const RESET_CONTAINER_MARKER = 'data-mn-container'

const RESET_CSS = `
:where([${RESET_MARKER}]) {
  box-sizing: border-box;
  position: relative;
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  min-width: 0;
  min-height: 0;
  margin: 0;
  padding: 0;
  border: 0 solid transparent;
  background-color: transparent;
  -webkit-appearance: none;
  appearance: none;
  text-decoration: none;
  list-style: none;
  -webkit-tap-highlight-color: transparent;
  font: inherit;
  color: inherit;
  text-align: inherit;
}
:where([${RESET_CONTAINER_MARKER}]) {
  font: var(--mn-font, 16px / 1.5 system-ui, sans-serif);
  color: var(--mn-color, CanvasText);
}
`

/**
 * Installs the reset once per document.
 *
 * Idempotent by id rather than by a module flag, because a module flag would be
 * wrong in the two cases that matter: a test that builds several hosts in one
 * document, and a hot reload that re-evaluates the module while the old
 * stylesheet is still in the page.
 *
 * A document that is not there yet — a script in `<head>` with no `<head>`, or
 * a non-browser environment reaching this by mistake — is a no-op rather than a
 * throw. Failing to boot over a stylesheet would be a poor trade.
 */
export const installDomReset = (): void => {
  const head = document.head
  if (!head || head.querySelector(`#${STYLE_ID}`)) return

  const style = document.createElement('style')
  style.id = STYLE_ID
  style.textContent = RESET_CSS
  // Prepended rather than appended, so an app's own stylesheet comes after this
  // one. The `:where()` wrapper already means specificity cannot go the wrong
  // way, and order is the remaining tie-break for equally specific rules.
  head.prepend(style)
}
