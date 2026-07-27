import {
  bindAttr,
  bindChecked,
  bindClass,
  bindHtml,
  bindSelect,
  bindShow,
  bindText,
  bindValue,
  computed,
  signal,
  template,
} from '@amritk/mini'

import { Out, Page, Section } from '../lib/ui'

/**
 * The imperative half of mini. JSX is a convenience over exactly these calls —
 * when you already hold an element (from `template()`, a `ref`, or the page you
 * are progressively enhancing), the bind helpers are the whole API.
 */
export const BindingsPage = (): HTMLElement => (
  <Page
    title="Bindings"
    lede="Seven typed bindings and one deliberately awkward HTML sink. Each one is an effect that writes a single property, so nothing here diffs and nothing re-renders."
  >
    <TextAttrClass />
    <TwoWay />
    <ShowBinding />
    <HtmlSink />
    <Templates />
  </Page>
)

/** `bindText`, `bindAttr`, `bindClass` — the write-one-property bindings. */
const TextAttrClass = (): HTMLElement => {
  const level = signal(1)
  const label = computed(() => `level ${level()}`)

  return (
    <Section
      title="bindText · bindAttr · bindClass"
      blurb="bindText writes textContent (never innerHTML), bindAttr sets or removes an attribute, and bindClass toggles a single class name. All three are reached through a ref here — JSX props would be the shorter spelling of the same effects."
    >
      <div class="stack">
        <div class="row">
          <button type="button" onClick={() => level(Math.max(0, level() - 1))}>
            −
          </button>
          <button type="button" onClick={() => level(Math.min(3, level() + 1))}>
            +
          </button>
          <span
            class="pill"
            ref={(element) => {
              bindText(element, label)
              bindAttr(element, 'aria-valuenow', () => String(level()))
              bindClass(element, 'good', () => level() >= 2)
              bindClass(element, 'bad', () => level() === 0)
            }}
          />
        </div>
        <Out>
          {() =>
            `textContent → "${label()}"\naria-valuenow → "${level()}"\nclasses → pill${level() >= 2 ? ' good' : ''}${level() === 0 ? ' bad' : ''}`
          }
        </Out>
      </div>
    </Section>
  )
}

/** `bindValue`, `bindChecked`, `bindSelect` — the two-way form bindings. */
const TwoWay = (): HTMLElement => {
  const name = signal('Ada')
  const notes = signal('')
  const subscribed = signal(true)
  const plan = signal('pro')

  return (
    <Section
      title="bindValue · bindChecked · bindSelect"
      blurb="Two-way, and they survive being written from both ends: bindValue guards the caret against echoing a freshly-typed character and holds off IME composition, so CJK and accent input are not torn apart mid-candidate."
    >
      <div class="stack">
        <div class="row">
          <label for="name">Name</label>
          <input id="name" ref={(element) => bindValue(element, name)} />
          <label for="plan">Plan</label>
          <select id="plan" ref={(element) => bindSelect(element, plan)}>
            <option value="free">Free</option>
            <option value="pro">Pro</option>
            <option value="team">Team</option>
          </select>
          <label for="sub">Subscribed</label>
          <input id="sub" type="checkbox" ref={(element) => bindChecked(element, subscribed)} />
        </div>
        <textarea rows="2" placeholder="notes…" ref={(element) => bindValue(element, notes)} />
        <div class="row">
          <button type="button" onClick={() => name('Grace')}>
            set name from code
          </button>
          <button type="button" onClick={() => plan('team')}>
            set plan from code
          </button>
          <button type="button" onClick={() => subscribed(!subscribed())}>
            toggle checkbox from code
          </button>
        </div>
        <Out>
          {() =>
            `name: ${JSON.stringify(name())}\nplan: ${plan()}\nsubscribed: ${subscribed()}\nnotes: ${JSON.stringify(notes())}`
          }
        </Out>
      </div>
    </Section>
  )
}

/** `bindShow` — visibility that restores the element's own `display`. */
const ShowBinding = (): HTMLElement => {
  const open = signal(true)

  return (
    <Section
      title="bindShow"
      blurb="Toggles inline display without clobbering what the element asked for — a flex row hidden and shown again is still a flex row, not a block."
    >
      <div class="stack">
        <button type="button" onClick={() => open(!open())}>
          {() => (open() ? 'hide the row' : 'show the row')}
        </button>
        <div class="row" ref={(element) => bindShow(element, open)}>
          <span class="pill">still</span>
          <span class="pill">a</span>
          <span class="pill">flex row</span>
        </div>
      </div>
    </Section>
  )
}

/**
 * `bindHtml` — the single sanctioned `innerHTML` sink, and the only binding
 * whose signature is deliberately inconvenient.
 */
const HtmlSink = (): HTMLElement => {
  const raw = signal('<b>bold</b>, <i>italic</i>, and <img src=x onerror="alert(1)">')

  // A real app passes DOMPurify (or the platform's Sanitizer) here. The point of
  // the required argument is that there is no call site where sanitising was
  // simply forgotten — you have to name the function that makes the string safe.
  const sanitize = (html: string): string => {
    const parsed = new DOMParser().parseFromString(html, 'text/html')
    for (const node of parsed.body.querySelectorAll('*')) {
      if (!['B', 'I', 'EM', 'STRONG', 'CODE', 'BR'].includes(node.tagName)) node.replaceWith(...node.childNodes)
      else for (const attribute of [...node.attributes]) node.removeAttribute(attribute.name)
    }
    return parsed.body.innerHTML
  }

  return (
    <Section
      title="bindHtml"
      blurb="The sanitize argument is required at every call site, which is the whole design: there is exactly one way to write raw markup in mini and it cannot be reached without naming a sanitizer. Everything else in the package writes textContent."
    >
      <div class="stack">
        <input ref={(element) => bindValue(element, raw)} />
        <div class="out" ref={(element) => bindHtml(element, sanitize, raw)} />
        <p class="muted">
          The <code>onerror</code> payload above is stripped by the sanitizer, not by the binding.
        </p>
      </div>
    </Section>
  )
}

/**
 * `template()` — parse a static string once, clone it per row. The fast path
 * for repetition, and the reason `data-ref` exists.
 */
const ROW = template('<li><span data-ref="label"></span><span class="pill" data-ref="count"></span></li>')

/** The rows are fixed; only the numbers move, which is what `template` is for. */
const ENDPOINTS = ['GET /', 'GET /docs', 'POST /api/echo'] as const

const Templates = (): HTMLElement => {
  const counts = signal<readonly number[]>([128, 41, 7])

  const bump = (): void => counts(counts().map((count) => count + Math.round(Math.random() * 3)))

  const rows = ENDPOINTS.map((endpoint, index) => {
    const { root, ref } = ROW()
    const label = ref['label']
    const count = ref['count']
    if (label) bindText(label, () => endpoint)
    if (count) bindText(count, () => String(counts()[index] ?? 0))
    return root
  })

  return (
    <Section
      title="template"
      blurb="The HTML string is parsed once and cloned per instance; every dynamic value goes in through a bind helper rather than interpolation, which keeps template() off the XSS surface entirely."
    >
      <div class="stack">
        <button type="button" onClick={bump}>
          simulate traffic
        </button>
        <ul class="list">{rows}</ul>
      </div>
    </Section>
  )
}
