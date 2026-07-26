/** @jsxImportSource @amritk/mini-native */
// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'

import { applyProp } from './apply-prop'
import type { ElementProps, ElementTag } from './elements'
import { ELEMENT_TAGS } from './elements'
import { createDomHost } from './hosts/create-dom-host'
import { clearHost, setHost } from './index'

/**
 * A structural test: does every prop the vocabulary DOCUMENTS actually do
 * something on the DOM host?
 *
 * The audit found four that did not — `fit`, `lines`, `direction`, and
 * `multiline` all reached the element as literal attributes the browser ignores,
 * so `<image fit="cover">` typechecked, rendered, and quietly did nothing. That
 * was found by reading. It is checkable by machine, and a vocabulary this small
 * is exactly the size where doing so is worth it.
 *
 * The failure mode is specific and nasty: an unimplemented prop is invisible in
 * the preview *and* on the device, because nothing errors — the element simply
 * carries an attribute nobody reads. A prop the framework documents and no host
 * honours is a lie, and this is what makes telling one an error.
 *
 * It is deliberately about the DOM host. The memory host records every prop by
 * construction, and the Lynx host passes most of them through as attributes the
 * engine really does read, so neither can be wrong in this particular way.
 */
describe('vocabulary coverage', () => {
  it('covers every prop in the type', () => {
    // The manifest below is hand-written, and this is what keeps it honest: the
    // type of SAMPLES demands one entry per prop per tag, so adding a prop to
    // `ElementProps` without adding it here fails `types:check` rather than
    // quietly going untested. That compile-time link is the whole mechanism —
    // without it the manifest would rot into a subset within a release or two.
    for (const tag of ELEMENT_TAGS) {
      expect(Object.keys(SAMPLES[tag]).length).toBeGreaterThan(0)
    }
  })

  it('leaves no documented prop sitting on the element as a dead attribute', () => {
    const host = createDomHost()
    setHost(host)
    const unconsumed: string[] = []

    for (const tag of ELEMENT_TAGS) {
      for (const [prop, sample] of Object.entries(SAMPLES[tag])) {
        // Through `applyProp` rather than straight to `setProperty`, because
        // that is the path a real element takes: `show` becomes a visibility
        // call, a handler becomes a listener, and only what is left is a
        // property. Testing the shortcut would flag every one of those as a
        // dead attribute and prove nothing.
        const handle = host.createElement(tag, { [prop]: sample })
        const element = handle as unknown as HTMLElement
        applyProp(handle, prop, sample)
        // The prop name appearing verbatim as an attribute means the host fell
        // through to its generic path without recognising it — unless that name
        // happens to be a real HTML attribute too, which is the whole of the
        // allowlist below.
        if (element.hasAttribute(prop.toLowerCase()) && !COINCIDES_WITH_HTML.has(prop)) {
          unconsumed.push(`${tag}.${prop}`)
        }
      }
    }

    expect(unconsumed).toEqual([])
    clearHost()
  })
})

/**
 * Vocabulary prop names that are also real HTML attributes, so finding one on
 * the element is the host working rather than failing.
 *
 * Kept as an explicit list rather than inferred, because "is this a real
 * attribute" is not a question the DOM answers — `element.hasAttribute` is just
 * as happy with `fit` as with `src`, which is precisely why the four bugs above
 * were invisible.
 */
const COINCIDES_WITH_HTML = new Set([
  'id',
  'class',
  'style',
  'src',
  'value',
  'placeholder',
  'readonly',
  'href',
  'role',
  // On an `<input>` this is the real attribute and the host is doing the right
  // thing; on a `<view>` the same prop becomes `aria-disabled` and never
  // appears under this name. One allowlist entry covers both, because the check
  // is "did the host recognise it", not "which spelling did it pick".
  'disabled',
])

/**
 * One sample value per prop, per tag.
 *
 * The mapped type is doing the real work: `-?` strips optionality so every key
 * is REQUIRED here, which turns "someone added a prop and forgot the test" from
 * an omission nobody notices into a compile error. `children`, `ref`, and `key`
 * are excluded because they describe an element's structure rather than its
 * properties and never reach `setProperty` at all.
 */
type PropSamples<Tag extends ElementTag> = {
  [Prop in Exclude<keyof ElementProps<Tag>, 'children' | 'ref' | 'key'>]-?: unknown
}

const NOOP = (): void => {}

/** A sample for every prop shared by all five tags. */
const COMMON = {
  show: true,
  class: 'card',
  style: { width: 10 },
  id: 'one',
  testId: 'one',
  onTap: NOOP,
  onLongPress: NOOP,
  onFocus: NOOP,
  onBlur: NOOP,
  role: 'button',
  level: 2,
  label: 'Save',
  hint: 'writes to disk',
  focusable: true,
  disabled: true,
  selected: true,
  checked: true,
  expanded: true,
  href: '/pricing',
}

const SAMPLES: { [Tag in ElementTag]: PropSamples<Tag> } = {
  view: { ...COMMON },
  text: { ...COMMON, lines: 2, selectable: false },
  image: { ...COMMON, src: '/puck.png', fit: 'cover', onLoad: NOOP, onError: NOOP },
  'scroll-view': { ...COMMON, axis: 'horizontal', onScroll: NOOP },
  input: {
    ...COMMON,
    value: 'sam',
    placeholder: 'name',
    readonly: true,
    multiline: false,
    keyboard: 'email',
    secure: true,
    onInput: NOOP,
    onChange: NOOP,
  },
}
