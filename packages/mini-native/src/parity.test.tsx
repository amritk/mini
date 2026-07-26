/** @jsxImportSource @amritk/mini-native */
// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest'

import { For } from './flow'
import { createDomHost, domRoot } from './hosts/create-dom-host'
import { createLynxHost, lynxRoot } from './hosts/create-lynx-host'
import { createMemoryHost, type MemoryElement } from './hosts/create-memory-host'
import type { LynxElement, LynxElementApi } from './hosts/lynx-element-api'
import type { HostElement } from './index'
import { clearHost, mount, setHost } from './index'
import { Button, Heading, List, ListItem, Screen } from './ui'

/**
 * The parity suite.
 *
 * Every other suite asks whether ONE host behaved. This one asks whether the
 * hosts agree, which is the only question write-once actually rests on. The
 * failure mode it exists to catch is silent drift: the web target keeps working
 * while the device target quietly stops matching, because in day-to-day work
 * nobody runs the second one. A role that lands on the DOM and not on Lynx
 * should fail here rather than on a device.
 *
 * What it compares is deliberately SEMANTIC rather than structural. Asserting
 * markup would just re-test each host's mapping table, which the per-host suites
 * already do, and would fail every time a mapping legitimately changed. So each
 * host is read back into the same small description — what is this element, what
 * is it called, can it be reached, is it available — and the three descriptions
 * have to be identical.
 *
 * It carries the happy-dom pragma because comparing against the DOM host needs a
 * document. That does NOT weaken the DOM-free guarantee: the memory and Lynx
 * suites still run in plain node where `document` genuinely does not exist, and
 * they are what prove the runtime carries no platform dependency. This file is
 * excluded from `tsconfig.json` and checked by `tsconfig.dom.json` for the same
 * reason `create-dom-host.test.tsx` is.
 */
afterEach(() => {
  clearHost()
})

/**
 * The description every host is read back into.
 *
 * Small on purpose. These are the facts a component author asserted by writing
 * a `role`, and the ones a user actually experiences — everything else is a
 * spelling difference between targets, which is exactly what a host is for.
 */
type Semantics = {
  /** What the element is, as the target would report it. */
  role: string | null
  /** The accessible name. */
  name: string | null
  /** Whether the element can be reached, or `null` when nothing was said. */
  focusable: boolean | null
  /** Whether the element is unavailable, or `null` when nothing was said. */
  disabled: boolean | null
}

describe('host parity', () => {
  it('agrees on what a button is', () => {
    const seen = renderEverywhere(() => <view role="button" label="Save" disabled={true} />)

    // Three targets, three completely different spellings — a real <button
    // disabled aria-label>, a view with accessibility-* attributes, a plain
    // object — describing one element the same way.
    expectAgreement(seen, { role: 'button', name: 'Save', focusable: null, disabled: true })
  })

  it('agrees on what a heading is', () => {
    const seen = renderEverywhere(() => (
      <text role="heading" level={2}>
        Pricing
      </text>
    ))

    // The DOM host drops `level` because an <h2> already carries it; the others
    // keep it as an attribute. Reading semantics back rather than markup is what
    // lets both be correct.
    expectAgreement(seen, { role: 'heading', name: null, focusable: null, disabled: null })
  })

  it('agrees on a link', () => {
    const seen = renderEverywhere(() => <view role="link" href="/pricing" label="Pricing" />)

    expectAgreement(seen, { role: 'link', name: 'Pricing', focusable: null, disabled: null })
  })

  it('agrees on an element taken out of the focus order', () => {
    const seen = renderEverywhere(() => <view role="button" focusable={false} />)

    // The tri-state case. `false` has to survive as a stated opt-out on every
    // target, not collapse into "nothing was said" — on the web because a
    // <button> is focusable without being asked.
    expectAgreement(seen, { role: 'button', name: null, focusable: false, disabled: null })
  })

  it('agrees that a framework-inserted wrapper is not an element', () => {
    const seen = renderEverywhere(
      () => (
        <view role="list">
          <For each={[1]}>{() => <view role="listitem" />}</For>
        </view>
      ),
      { depth: 1 },
    )

    // Read one level in: the wrapper `For` built, which nobody wrote. Every host
    // has to keep it out of the accessibility tree in its own spelling, or it
    // severs list-owns-listitem for a screen reader on that target alone.
    expectAgreement(seen, { role: 'presentation', name: null, focusable: null, disabled: null })
  })
})

/**
 * The component layer, held to the same standard as the vocabulary.
 *
 * `/ui` has no appearance by design — it ships semantics and leaves taste to
 * the app — which means every component in it has an outcome that can be
 * asserted on all three hosts. That is not a happy accident; it is the reason
 * the line between the two was drawn where it was.
 */
describe('component-layer parity', () => {
  it('agrees that a Button can be reached', () => {
    const seen = renderEverywhere(() => <Button label="Save" />)

    // The finding that made the component worth having. Without the stated
    // `focusable`, all three hosts would report `null` here and the suite would
    // call that agreement — while a real <button> sat in the focus order and a
    // Lynx view with a button role sat outside it. Both hosts would be right;
    // the component is what makes them the same.
    expectAgreement(seen, { role: 'button', name: 'Save', focusable: true, disabled: null })
  })

  it('agrees on a Heading', () => {
    const seen = renderEverywhere(() => <Heading level={3}>Pricing</Heading>)

    expectAgreement(seen, { role: 'heading', name: null, focusable: null, disabled: null })
  })

  it('agrees on a List built the way a screen would build one', () => {
    const seen = renderEverywhere(
      () => (
        <List>
          <For each={[1]}>{() => <ListItem>Milk</ListItem>}</For>
        </List>
      ),
      { depth: 2 },
    )

    // Two levels in — past the flow wrapper — is where the item sits, which is
    // exactly the shape a `<ul>` could not have survived.
    expectAgreement(seen, { role: 'listitem', name: null, focusable: null, disabled: null })
  })

  it('agrees on a Screen', () => {
    const seen = renderEverywhere(() => <Screen />)

    // The insets differ per target and that is the point of the component; what
    // must not differ is that this is the main content region on all three.
    expectAgreement(seen, { role: 'main', name: null, focusable: null, disabled: null })
  })
})

/**
 * Every shipped host has to say what it is.
 *
 * `platform.os` reading `unknown` is meant to describe a host somebody else
 * wrote and did not annotate, never one of these — and a host that quietly
 * stopped naming itself would take every `platform.select` in an app down to
 * its default branch without failing anything.
 */
describe('host identity', () => {
  it('names itself on every shipped host', () => {
    expect(createDomHost().platform).toBe('web')
    expect(createLynxHost(createFakeEngine().api).platform).toBe('lynx')
    expect(createMemoryHost().host.platform).toBe('memory')
  })

  it('reports an environment only where there is something to report', () => {
    // The memory host has no screen, so it says nothing — which is what keeps
    // the runtime's documented fallbacks exercised on every run. The Lynx host
    // says nothing either unless the app hands it something, because the PAPI
    // subset it drives is element-level and guessing at the engine's system
    // globals would mean reporting plausible values that are wrong per build.
    expect(createDomHost().environment).toBeDefined()
    expect(createMemoryHost().host.environment).toBeUndefined()
    expect(createLynxHost(createFakeEngine().api).environment).toBeUndefined()
    expect(
      createLynxHost(createFakeEngine().api, { environment: { safeArea: () => INSETS } }).environment?.safeArea?.(),
    ).toEqual(INSETS)
  })
})

const INSETS = { top: 59, right: 0, bottom: 34, left: 0 }

describe('event parity', () => {
  it('agrees on the shape of a tap that carried a position', () => {
    expect(tapEverywhere({ x: 12, y: 34 })).toEqual([
      { x: 12, y: 34 },
      { x: 12, y: 34 },
      { x: 12, y: 34 },
    ])
  })

  it('agrees that a tap without a position reports none', () => {
    // The case a component reads to decide where to put a ripple. If one target
    // reported the top-left corner instead, the divergence would only show up as
    // a visual oddity for keyboard users on that target.
    expect(tapEverywhere(null)).toEqual([{}, {}, {}])
  })
})

/**
 * Builds the same component on all three hosts and reads each back.
 *
 * `depth` walks down first children before reading, which is how an assertion
 * reaches a node the component never wrote — the wrapper a control-flow
 * component inserted being the case that matters.
 */
const renderEverywhere = (component: () => HostElement, { depth = 0 }: { depth?: number } = {}): Semantics[] => {
  const results: Semantics[] = []

  setHost(createDomHost())
  const domRootElement = document.createElement('div')
  mount(domRoot(domRootElement), component)
  let domNode = domRootElement.firstElementChild as HTMLElement | null
  for (let step = 0; step < depth; step++) domNode = (domNode?.firstElementChild as HTMLElement) ?? null
  results.push(domSemantics(domNode))
  clearHost()

  const engine = createFakeEngine()
  setHost(createLynxHost(engine.api))
  mount(lynxRoot(engine.root as unknown as LynxElement), component)
  let lynxNode: FakeElement | null = engine.root.children[0] ?? null
  for (let step = 0; step < depth; step++) lynxNode = lynxNode?.children[0] ?? null
  results.push(lynxSemantics(lynxNode))
  clearHost()

  const memory = createMemoryHost()
  setHost(memory.host)
  mount(memory.rootElement, component)
  let memoryNode = (memory.root.children[0] ?? null) as MemoryElement | null
  for (let step = 0; step < depth; step++) {
    memoryNode = (memoryNode?.children[0] ?? null) as MemoryElement | null
  }
  results.push(memorySemantics(memoryNode))
  clearHost()

  return results
}

/**
 * Fires a tap on each host and reports the portable fields each handler saw.
 *
 * `raw` is dropped before comparing, because it is by definition the part that
 * differs — it holds whatever the target handed over.
 */
const tapEverywhere = (point: { x: number; y: number } | null): Record<string, unknown>[] => {
  const results: Record<string, unknown>[] = []
  const seen = (event: unknown): void => {
    const { raw: _raw, ...portable } = event as Record<string, unknown>
    results.push(portable)
  }

  setHost(createDomHost())
  const domRootElement = document.createElement('div')
  mount(domRoot(domRootElement), () => <view onTap={seen} />)
  const domElement = domRootElement.firstElementChild as HTMLElement
  domElement.getBoundingClientRect = () => ({ left: 0, top: 0 }) as DOMRect
  domElement.dispatchEvent(
    point === null
      ? new MouseEvent('click', { detail: 0 })
      : new MouseEvent('click', { clientX: point.x, clientY: point.y, detail: 1 }),
  )
  clearHost()

  const engine = createFakeEngine()
  setHost(createLynxHost(engine.api))
  mount(lynxRoot(engine.root as unknown as LynxElement), () => <view onTap={seen} />)
  engine.root.children[0]?.events.get('bindEvent:tap')?.(point === null ? {} : { detail: point })
  clearHost()

  const memory = createMemoryHost()
  setHost(memory.host)
  mount(memory.rootElement, () => <view onTap={seen} />)
  for (const listener of (memory.root.children[0] as MemoryElement).listeners.get('tap') ?? []) {
    listener(point ?? {})
  }
  clearHost()

  return results
}

/** Asserts every host reported the same thing, and that it is the right thing. */
const expectAgreement = (seen: Semantics[], expected: Semantics): void => {
  for (const actual of seen) expect(actual).toEqual(expected)
}

/**
 * How a browser reports the element, read back from what was actually built
 * rather than from what was asked for — an implicit role from a real `<button>`
 * counts the same as an explicit `role` attribute, which is the point.
 */
const domSemantics = (element: HTMLElement | null): Semantics => {
  if (!element) return EMPTY
  const tabindex = element.getAttribute('tabindex')
  return {
    role:
      element.getAttribute('aria-hidden') === 'true'
        ? 'none'
        : (element.getAttribute('role') ?? IMPLICIT_ROLES[element.tagName] ?? null),
    name: element.getAttribute('aria-label') ?? element.getAttribute('alt') ?? null,
    focusable: tabindex === null ? null : tabindex !== '-1',
    disabled: element.hasAttribute('disabled') ? true : element.getAttribute('aria-disabled') === 'true' ? true : null,
  }
}

/** The roles a real HTML element carries without being told. */
const IMPLICIT_ROLES: Record<string, string> = {
  BUTTON: 'button',
  A: 'link',
  H1: 'heading',
  H2: 'heading',
  H3: 'heading',
  H4: 'heading',
  H5: 'heading',
  H6: 'heading',
  NAV: 'navigation',
  MAIN: 'main',
  HEADER: 'banner',
  FOOTER: 'contentinfo',
}

/** How the Lynx engine reports the element. */
const lynxSemantics = (element: FakeElement | null): Semantics => {
  if (!element) return EMPTY
  const attrs = element.attrs
  return {
    role: attrs['accessibility-element'] === false ? 'presentation' : ((attrs['accessibility-role'] as string) ?? null),
    name: (attrs['accessibility-label'] as string) ?? null,
    focusable: attrs['focusable'] === undefined ? null : attrs['focusable'] === true,
    disabled: attrs['accessibility-disabled'] === true ? true : null,
  }
}

/** How the reference host reports the element. */
const memorySemantics = (element: MemoryElement | null): Semantics => {
  if (!element) return EMPTY
  const props = element.props
  return {
    role: (props['role'] as string) ?? null,
    name: (props['label'] as string) ?? null,
    focusable: props['focusable'] === undefined ? null : props['focusable'] === true,
    disabled: props['disabled'] === true ? true : null,
  }
}

const EMPTY: Semantics = { role: null, name: null, focusable: null, disabled: null }

/** A node in the fake Lynx engine tree. Mirrors the shape the real PAPI maintains. */
type FakeElement = {
  tag: string
  attrs: Record<string, unknown>
  children: FakeElement[]
  parent: FakeElement | null
  events: Map<string, ((event: unknown) => void) | null>
}

/**
 * A stand-in for the Lynx engine, trimmed to what parity needs.
 *
 * `create-lynx-host.test.tsx` has the full one; duplicating a smaller version
 * here keeps this file readable and avoids exporting test scaffolding from a
 * suite that is not about parity.
 */
const createFakeEngine = (): { api: LynxElementApi; root: FakeElement } => {
  const make = (tag: string): FakeElement => ({ tag, attrs: {}, children: [], parent: null, events: new Map() })
  const root = make('page')
  const as = (element: LynxElement): FakeElement => element as unknown as FakeElement
  const detach = (child: FakeElement): void => {
    const siblings = child.parent?.children
    if (!siblings) return
    const at = siblings.indexOf(child)
    if (at !== -1) siblings.splice(at, 1)
    child.parent = null
  }

  const api: LynxElementApi = {
    __CreateElement: (tag) => make(tag) as unknown as LynxElement,
    __SetAttribute: (element, name, value) => {
      if (value === null) delete as(element).attrs[name]
      else as(element).attrs[name] = value
    },
    __GetAttributes: (element) => as(element).attrs,
    __SetClasses: () => {},
    __SetInlineStyles: () => {},
    __AddInlineStyle: () => {},
    __AddEvent: (element, type, name, listener) => {
      as(element).events.set(`${type}:${name}`, listener)
    },
    __AppendElement: (parent, child) => {
      detach(as(child))
      as(parent).children.push(as(child))
      as(child).parent = as(parent)
    },
    __InsertElementBefore: (parent, child, anchor) => {
      detach(as(child))
      const at = as(parent).children.indexOf(as(anchor))
      as(parent).children.splice(at === -1 ? as(parent).children.length : at, 0, as(child))
      as(child).parent = as(parent)
    },
    __RemoveElement: (_parent, child) => detach(as(child)),
    __GetParent: (element) => (as(element).parent as unknown as LynxElement) ?? null,
    __GetChildren: (element) => [...as(element).children] as unknown as LynxElement[],
    __FirstElement: (element) => (as(element).children[0] as unknown as LynxElement) ?? null,
    __NextElement: (element) => {
      const siblings = as(element).parent?.children
      if (!siblings) return null
      return (siblings[siblings.indexOf(as(element)) + 1] as unknown as LynxElement) ?? null
    },
    __FlushElementTree: () => {},
  }

  return { api, root }
}
