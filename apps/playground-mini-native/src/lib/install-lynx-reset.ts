/**
 * The stylesheet that makes a browser lay out the way Lynx does.
 *
 * This is the part that decides whether the preview is honest. The DOM PAPI
 * next door reproduces the element tree exactly — same tags, same attributes,
 * same events — and none of that matters if the browser disagrees with the
 * engine about what an element IS before a single declaration is written. It
 * does, and every one of the differences is silent:
 *
 * | | Lynx | CSS |
 * | --- | --- | --- |
 * | `display` | `linear` (direction `column`) | `block` |
 * | `position` | `relative`, and `static` does not exist | `static` |
 * | `overflow` | `hidden` | `visible` |
 * | `background-repeat` | `no-repeat` | `repeat` |
 * | `flex-shrink` | `0` in practice for a linear child | `1` |
 * | text properties | do not inherit through a container | inherit |
 *
 * An unstyled container with two children stacks vertically on a device and
 * horizontally in a browser; a colour set on a container reaches nested text
 * here and silently does not there. Both are the difference between a screen
 * you can trust the preview about and one you cannot.
 *
 * ## Three decisions worth knowing
 *
 * **Linear is approximated with flex-column.** Lynx's default layout is
 * `linear`, which is its own algorithm — `linear-weight`, `linear-weight-sum`
 * and `linear-cross-gravity` have no CSS equivalent. Flex-column matches its
 * observable behaviour for the common case (stack children along the block
 * axis) and diverges the moment weights are involved. It is an approximation,
 * named as one, and it is the closest CSS gets.
 *
 * **Zero specificity.** Every rule is wrapped in `:where()`, so the reset never
 * wins an argument with the app. An inline style, a class, anything at all
 * overrides it without `!important` and without counting selectors. A reset
 * that fights the code above it is a reset people work around.
 *
 * **Scoped to the app root**, which carries {@link LYNX_ROOT_ATTRIBUTE}. Only
 * the tree the PAPI built is reset, so the page's own chrome — the device frame
 * around the preview, an overlay layer, anything a host page brings — keeps its
 * ordinary web defaults. A global reset here would be this module reaching
 * outside the thing it is previewing.
 *
 * ## Text inheritance, which is the subtle one
 *
 * `enableCSSInheritance` is `false` by default, so on a device a `<text>`
 * nested in a styled container inherits nothing from it, while a run nested in
 * a `<text>` inherits everything. That is reproduced by re-asserting the base
 * text properties on EVERY element and then handing inheritance back to the
 * inline run — `raw-text`, `inline-text`, and a `<text>` inside a `<text>`,
 * which is the one nesting Lynx does let the cascade through.
 *
 * The base is expressed through custom properties, so an app that wants a
 * different default font sets `--lynx-font` once instead of fighting this file.
 * Custom properties are inherited in Lynx too, so that is portable.
 */

/** Marks the element the reset is scoped to — the page element the PAPI owns. */
export const LYNX_ROOT_ATTRIBUTE = 'data-lynx-root'

/** The `id` the stylesheet is installed under, so a second PAPI adds no second copy. */
const STYLE_ID = 'lynx-preview-reset'

/**
 * The scope, as its own zero-specificity group.
 *
 * Every rule below reads `${SCOPE} :where(tags)` — the descendant combinator
 * sits BETWEEN two `:where()` groups rather than inside one. That is the same
 * selector either way, and it keeps the scope and the subject separately
 * zeroed, which is easier to read than one long group. It also happens to be
 * the form happy-dom evaluates correctly: it mis-resolves a combinator written
 * inside `:where(…)`, and the suite next door asserts on computed styles.
 */
const SCOPE = `:where([${LYNX_ROOT_ATTRIBUTE}])`

const RESET_CSS = `
${SCOPE},
${SCOPE} :where(*) {
  box-sizing: border-box;
  /* An approximation of Lynx's \`linear\` layout, whose default direction is
     column. Flex is the closest CSS has; linear weights have no equivalent. */
  display: flex;
  flex-direction: column;
  /* Lynx has no \`static\`, and \`relative\` is the initial value there. */
  position: relative;
  flex-shrink: 0;
  min-width: 0;
  min-height: 0;
  /* Both of these are the web-INVERSE of Lynx's default. */
  overflow: hidden;
  background-repeat: no-repeat;
  margin: 0;
  padding: 0;
  border: 0 solid currentColor;
  background-color: transparent;
  appearance: none;
  -webkit-tap-highlight-color: transparent;
  /* Re-asserted on every element, which is what stops a container's colour or
     font from reaching a nested <text> the way CSS would let it. */
  font: var(--lynx-font, 16px / 1.4 system-ui, sans-serif);
  color: var(--lynx-color, CanvasText);
  text-align: start;
}

/* Inside a <text>, Lynx does keep the cascade — an inline run and a nested
   <text> both take their colour and font from the text around them. Those
   three tags plus a nested <text> are the whole of it; every other element is
   a container, and a container is where inheritance stops. */
${SCOPE} :where(raw-text, inline-text, inline-truncation),
${SCOPE} :where(text) :where(text) {
  font: inherit;
  color: inherit;
  text-align: inherit;
}

/* A <text> lays its children out as text, not as a linear container. */
${SCOPE} :where(text) {
  display: block;
}

${SCOPE} :where(raw-text, inline-text) {
  display: inline;
}

/* A wrapper holds children without taking part in layout, which is exactly
   what \`display: contents\` means. */
${SCOPE} :where(wrapper) {
  display: contents;
}

/* Vertical is the default \`scroll-orientation\`; a horizontal one overrides
   this from the attribute table. The cross axis is pinned rather than left to
   spill, because a native scroller scrolls exactly one way. */
${SCOPE} :where(scroll-view) {
  overflow-x: hidden;
  overflow-y: auto;
}

/* \`scaleToFill\` is the default \`mode\`, and it means stretch. */
${SCOPE} :where(image) {
  display: block;
  object-fit: fill;
}

/* <input> and <textarea> happen to be real HTML controls under the same names,
   so they need no mapping at all — only a display that suits a form field. */
${SCOPE} :where(input, textarea) {
  display: block;
}
`

/**
 * Installs the reset once per document.
 *
 * Idempotent by element id rather than by a module flag, because a module flag
 * is wrong in the two cases that actually happen: a test that builds several
 * PAPIs in one document, and a hot reload that re-evaluates this module while
 * the previous stylesheet is still in the page.
 *
 * It is prepended rather than appended so an app's own stylesheet comes after
 * it. Specificity cannot go the wrong way — every rule is inside `:where()` —
 * so document order is the remaining tie-break, and the reset should lose it.
 */
export const installLynxReset = (document: Document): void => {
  if (document.getElementById(STYLE_ID)) return

  const style = document.createElement('style')
  style.id = STYLE_ID
  style.textContent = RESET_CSS
  document.head.prepend(style)
}
