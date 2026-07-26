/** @jsxImportSource @amritk/mini-native */
// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest'

import { For } from '../flow'
import { clearHost, mount, setHost, signal } from '../index'
import { createDomHost, domRoot } from './create-dom-host'

/**
 * The DOM host is the only part of the framework that knows what a browser is,
 * so it is also the only suite that needs one — hence the environment pragma
 * above. Everything else runs against the in-memory host with no platform at
 * all, in the default node environment where `document` does not exist.
 *
 * The `@jsxImportSource` pragma is here for a related reason. This file is
 * excluded from `tsconfig.json` (that config is what keeps the core DOM-free)
 * and type-checked by `tsconfig.dom.json` instead, so the bundler that
 * transforms it for a test run finds no tsconfig claiming it and falls back to
 * the default `react` JSX source. The pragma states the runtime on the file
 * itself rather than leaving it to tsconfig resolution.
 */
afterEach(() => {
  clearHost()
})

/** Builds a fresh container element to mount into. */
const container = (): Element => document.createElement('div')

describe('create-dom-host', () => {
  it('maps the element vocabulary onto HTML tags', () => {
    setHost(createDomHost())
    const root = container()

    mount(domRoot(root), () => (
      <view>
        <text>hello</text>
        <image src="/puck.png" />
      </view>
    ))

    // `view` is a div and `text` is a span — the browser is the guest here,
    // rendering a native vocabulary rather than defining it.
    expect(root.innerHTML).toBe('<div><span>hello</span><img src="/puck.png"></div>')
  })

  it('maps native gesture names onto DOM events', () => {
    setHost(createDomHost())
    const root = container()
    let taps = 0

    mount(domRoot(root), () => <view onTap={() => taps++} />)
    ;(root.firstChild as HTMLElement).click()

    expect(taps).toBe(1)
  })

  it('updates reactive text without rebuilding the element', () => {
    setHost(createDomHost())
    const root = container()
    const name = signal('sam')

    mount(domRoot(root), () => <text>{() => `hi ${name()}`}</text>)
    const span = root.firstChild as HTMLElement

    expect(span.textContent).toBe('hi sam')
    name('alex')
    expect(span.textContent).toBe('hi alex')
    // Same node throughout: there is no re-render, only a text mutation.
    expect(root.firstChild).toBe(span)
  })

  it('applies a style bag with camelCase keys converted to CSS names', () => {
    setHost(createDomHost())
    const root = container()

    mount(domRoot(root), () => <view style={{ paddingTop: '4px', flexGrow: 1 }} />)

    const element = root.firstChild as HTMLElement
    expect(element.style.getPropertyValue('padding-top')).toBe('4px')
    expect(element.style.getPropertyValue('flex-grow')).toBe('1')
  })

  it('renames vocabulary props that spell differently in HTML', () => {
    setHost(createDomHost())
    const root = container()

    mount(domRoot(root), () => <input testId="email" keyboard="email" />)

    const element = root.firstChild as HTMLElement
    expect(element.getAttribute('data-testid')).toBe('email')
    expect(element.getAttribute('type')).toBe('email')
  })

  it('hides an element in place rather than detaching it', () => {
    setHost(createDomHost())
    const root = container()
    const visible = signal(true)

    mount(domRoot(root), () => <view show={visible} />)
    const element = root.firstChild as HTMLElement

    visible(false)
    expect(element.style.display).toBe('none')
    expect(root.childNodes).toHaveLength(1)
  })

  it('gives the flow wrapper display contents so it leaves layout alone', () => {
    // On the web the wrapper has to disappear from layout or it would break the
    // parent's flex or grid flow. Native hosts need no such trick.
    setHost(createDomHost())
    const host = createDomHost()
    const wrapper = host.createFlowHost() as unknown as HTMLElement

    expect(wrapper.style.display).toBe('contents')
  })

  it('detaches the tree when the mount is disposed', () => {
    setHost(createDomHost())
    const root = container()

    const dispose = mount(domRoot(root), () => <view />)
    dispose()

    expect(root.innerHTML).toBe('')
  })
})

/**
 * The semantics layer. These assert what an element MEANS rather than what it
 * looks like, which is the difference between a preview and a page you would
 * ship — a `<div>` with a tap handler is unreachable by keyboard no matter how
 * convincing it looks.
 */
describe('create-dom-host accessibility', () => {
  it('builds the real element a role implies', () => {
    setHost(createDomHost())
    const root = container()

    mount(domRoot(root), () => (
      <view>
        <view role="button" onTap={() => {}} />
        <view role="link" href="/pricing" />
        <view role="navigation" />
        <view role="main" />
      </view>
    ))

    // Not a div with an ARIA role: a real button and a real anchor, so focus
    // order, Enter and Space activation, and middle-click come from the
    // browser rather than being re-synthesised.
    expect(root.innerHTML).toBe(
      '<div><button type="button"></button><a href="/pricing"></a><nav></nav><main></main></div>',
    )
  })

  it('builds a heading at the requested depth, defaulting to 2', () => {
    setHost(createDomHost())
    const root = container()

    mount(domRoot(root), () => (
      <view>
        <text role="heading" level={1}>
          title
        </text>
        <text role="heading">section</text>
      </view>
    ))

    // The default is 2 rather than 1 because a page's single h1 should be
    // something an author chose, not something they got by omission.
    expect(root.innerHTML).toBe('<div><h1>title</h1><h2>section</h2></div>')
  })

  it('keeps list roles generic, so a flow wrapper cannot invalidate them', () => {
    setHost(createDomHost())
    const root = container()

    mount(domRoot(root), () => (
      <view role="list">
        <view role="listitem" />
      </view>
    ))

    // A real <ul> accepts only <li>, which is a parse-level content model — and
    // the control-flow components put a wrapper in between. An ARIA role has no
    // content model, so this survives what <ul> would not.
    expect(root.innerHTML).toBe('<div role="list"><div role="listitem"></div></div>')
  })

  it('keeps the flow wrapper out of the accessibility tree', () => {
    setHost(createDomHost())
    const root = container()

    mount(domRoot(root), () => (
      <view role="list">
        <For each={[1, 2]}>{(n) => <view role="listitem" testId={`row-${n}`} />}</For>
      </view>
    ))

    const wrapper = root.querySelector('[role="list"]')?.firstElementChild
    // Vanishing from layout is not vanishing from the accessibility tree, and
    // an interposed generic element severs list-owns-listitem for a screen
    // reader. `display: contents` alone has never been reliable for this.
    expect(wrapper?.getAttribute('role')).toBe('presentation')
    expect(wrapper?.getAttribute('style')).toContain('contents')
  })

  it('spells the accessible name per element', () => {
    setHost(createDomHost())
    const root = container()

    mount(domRoot(root), () => (
      <view>
        <image src="/puck.png" label="a puck" />
        <view role="button" label="save" />
      </view>
    ))

    // Same prop, two spellings — `alt` is what an <img> uses and `aria-label`
    // is what everything else uses. Which one is the host's problem, not the
    // component author's.
    expect(root.innerHTML).toBe(
      '<div><img src="/puck.png" alt="a puck"><button type="button" aria-label="save"></button></div>',
    )
  })

  it('prefers a real disabled attribute where one exists', () => {
    setHost(createDomHost())
    const root = container()

    mount(domRoot(root), () => (
      <view>
        <view role="button" disabled={true} />
        <view disabled={true} />
      </view>
    ))

    // A real <button disabled> is genuinely unclickable; `aria-disabled` only
    // announces it. Each element gets whichever it can actually honour.
    expect(root.innerHTML).toBe(
      '<div><button type="button" disabled=""></button><div aria-disabled="true"></div></div>',
    )
  })

  it('tracks reactive accessibility state', () => {
    setHost(createDomHost())
    const root = container()
    const open = signal(false)

    mount(domRoot(root), () => <view role="button" expanded={open} />)
    const button = root.firstElementChild as HTMLElement

    // `false` is written out rather than removing the attribute, which is the
    // one place these props break the contract's usual false-means-unset rule.
    // A collapsed disclosure is `aria-expanded="false"`; no attribute at all is
    // something that does not expand, and announcing the second for the first
    // is a different sentence.
    expect(button.getAttribute('aria-expanded')).toBe('false')
    open(true)
    expect(button.getAttribute('aria-expanded')).toBe('true')
    open(false)
    expect(button.getAttribute('aria-expanded')).toBe('false')
  })

  it('takes an element out of the tab order with an explicit -1', () => {
    setHost(createDomHost())
    const root = container()

    mount(domRoot(root), () => <view role="button" focusable={false} />)

    // Removing the attribute would leave a <button> natively focusable, so the
    // prop would appear to do nothing. Only an explicit -1 takes it back out.
    expect((root.firstElementChild as HTMLElement).getAttribute('tabindex')).toBe('-1')
  })

  it('does not leak href onto an element that cannot navigate', () => {
    setHost(createDomHost())
    const root = container()

    mount(domRoot(root), () => <view href="/pricing" />)

    // An attribute the browser ignores is the preview quietly stopping matching
    // the device, which is the bug class this host exists to avoid.
    expect(root.innerHTML).toBe('<div></div>')
  })

  it('hides a role="none" element from assistive technology', () => {
    setHost(createDomHost())
    const root = container()

    mount(domRoot(root), () => <view role="none" />)

    expect(root.innerHTML).toBe('<div aria-hidden="true"></div>')
  })
})

/**
 * Normalised event payloads. Without these `onScroll={(event) => …}` cannot be
 * written once — reading an offset would mean knowing which host is installed,
 * which is write-once failing at the event boundary no matter how good the
 * semantics layer is.
 */
describe('create-dom-host events', () => {
  it('reports a tap position in the element’s own box', () => {
    setHost(createDomHost())
    const root = container()
    let seen: { x?: number; y?: number } | null = null

    mount(domRoot(root), () => <view onTap={(event) => (seen = event)} />)
    const element = root.firstElementChild as HTMLElement
    element.getBoundingClientRect = () => ({ left: 10, top: 20 }) as DOMRect
    element.dispatchEvent(new MouseEvent('click', { clientX: 35, clientY: 50, detail: 1 }))

    // Local rather than viewport coordinates, because a viewport point means
    // something different once a native screen has safe-area insets.
    expect(seen).toMatchObject({ x: 25, y: 30 })
  })

  it('reports no position for a keyboard activation', () => {
    setHost(createDomHost())
    const root = container()
    let seen: { x?: number } | null = null

    mount(domRoot(root), () => <view role="button" onTap={(event) => (seen = event)} />)
    // Enter or Space on a focused button fires a real click whose coordinates
    // are zero, and `detail === 0` is how the browser says so. Reporting the
    // top-left corner would misplace a ripple for every keyboard user.
    root.firstElementChild?.dispatchEvent(new MouseEvent('click', { detail: 0 }))

    expect(seen).not.toBeNull()
    expect((seen as unknown as { x?: number }).x).toBeUndefined()
  })

  it('reports a scroll offset', () => {
    setHost(createDomHost())
    const root = container()
    let seen: { x: number; y: number } | null = null

    mount(domRoot(root), () => <scroll-view onScroll={(event) => (seen = event)} />)
    const element = root.firstElementChild as HTMLElement
    element.scrollTop = 120
    element.dispatchEvent(new Event('scroll'))

    expect(seen).toMatchObject({ x: 0, y: 120 })
  })

  it('puts the current text on an input event', () => {
    setHost(createDomHost())
    const root = container()
    let seen: { value: string } | null = null

    mount(domRoot(root), () => <input onInput={(event) => (seen = event)} />)
    const element = root.firstElementChild as HTMLInputElement
    element.value = 'sam'
    element.dispatchEvent(new Event('input'))

    // Reading it back off the element is the one thing every handler wants and
    // the one thing that differs per target.
    expect(seen).toMatchObject({ value: 'sam' })
  })

  it('keeps the platform event reachable on raw', () => {
    setHost(createDomHost())
    const root = container()
    let seen: { raw: unknown } | null = null

    mount(domRoot(root), () => <view onTap={(event) => (seen = event)} />)
    const click = new MouseEvent('click', { detail: 1 })
    root.firstElementChild?.dispatchEvent(click)

    // Normalising discards everything target-specific, so the escape hatch has
    // to exist — typed `unknown`, so reaching for it costs a cast and reads as
    // the platform-specific code it is.
    expect((seen as unknown as { raw: unknown }).raw).toBe(click)
  })
})
