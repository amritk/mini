import { computed, onCleanup, signal } from '@amritk/mini'

import { Out, Page, Section } from '../lib/ui'

/**
 * The compilerless JSX runtime. Every element here is a real `HTMLElement`
 * built exactly once — a JSX expression *is* the node, so a component can be
 * appended, measured, or handed to a `ref` with no unwrapping.
 */
export const JsxPage = (): HTMLElement => (
  <Page
    title="JSX"
    lede="A standard react-jsx transform pointed at @amritk/mini/jsx-runtime. It builds real DOM once — no virtual tree, no diffing, no re-render — and decides reactivity by the shape of each value at runtime."
  >
    <TheRule />
    <Attributes />
    <Classes />
    <Styles />
    <Visibility />
    <Refs />
  </Page>
)

/** The one thing that trips everybody up, shown side by side. */
const TheRule = (): HTMLElement => {
  const count = signal(0)

  // The mistake, made on purpose. Calling the signal reads it once and hands
  // whatever it returns to the runtime, so this number is 0 forever — which is
  // exactly what `attr={count()}` does at a JSX call site.
  const frozen = count()

  return (
    <Section
      title="Function is reactive, value is static"
      blurb="There is no compiler reading your code, so the runtime decides by value shape: a function-valued child or attribute is wrapped in an effect, anything else is applied once. Both readouts below were built at the same moment; only one still updates."
    >
      <div class="stack">
        <div class="row">
          <button type="button" onClick={() => count(count() + 1)}>
            increment
          </button>
          <button type="button" onClick={() => count(0)}>
            reset
          </button>
          {/* Reactive: the signal is passed uncalled, so the runtime wraps it. */}
          <span class="pill good">{count}</span>
          {/* Static: `frozen` is a plain number that was read once, above. */}
          <span class="pill bad">{frozen}</span>
        </div>
        <Out>
          {() =>
            [
              `<span>{count}</span>    → ${count()}   ← reactive, tracks forever`,
              `<span>{count()}</span>  → ${frozen}   ← frozen at creation`,
            ].join('\n')
          }
        </Out>
        <p class="muted">
          The <code>@amritk/mini/vite</code> plugin flags <code>{'attr={signal()}'}</code> in the dev overlay and fails{' '}
          <code>vite build</code> over it, so the second form only ever reaches production deliberately.
        </p>
      </div>
    </Section>
  )
}

/** Static and reactive attributes, and the `MaybeReactive<T>` type behind them. */
const Attributes = (): HTMLElement => {
  const busy = signal(false)
  const label = computed(() => (busy() ? 'working…' : 'idle'))

  return (
    <Section
      title="Attributes"
      blurb="Every attribute is typed MaybeReactive<T>, so both forms typecheck. Pass the signal uncalled (or a thunk) to bind it live."
    >
      <div class="stack">
        <div class="row">
          <button type="button" onClick={() => busy(!busy())}>
            toggle busy
          </button>
          {/* `disabled` and `title` both track; `type` is a constant and is written once. */}
          <button type="button" disabled={busy} title={label}>
            submit
          </button>
          <span class="pill" data-state={label}>
            {label}
          </span>
        </div>
        <Out>{() => `busy() → ${busy()}\nthe pill's data-state attribute tracks the same computed`}</Out>
      </div>
    </Section>
  )
}

/** `class` takes a string, an array, or a toggle map — each of them reactive. */
const Classes = (): HTMLElement => {
  const good = signal(true)

  return (
    <Section
      title="class"
      blurb="A string is applied verbatim, an array drops falsy entries and flattens, and an object keeps its truthy keys. Wrap the whole thing in a getter to track it."
    >
      <div class="stack">
        <div class="row">
          <button type="button" onClick={() => good(!good())}>
            toggle
          </button>
          <span class={() => ['pill', good() ? 'good' : 'bad']}>array form</span>
          <span class={() => ({ pill: true, good: good(), bad: !good() })}>object form</span>
        </div>
        <Out>{() => `resolved → "pill ${good() ? 'good' : 'bad'}"`}</Out>
      </div>
    </Section>
  )
}

/** `style` takes a cssText string or a property bag; bare numbers mean pixels. */
const Styles = (): HTMLElement => {
  const width = signal(140)
  const hue = signal(220)

  return (
    <Section
      title="style"
      blurb="A property bag with camelCase or kebab-case keys. A bare number becomes pixels, except on the properties CSS treats as unitless and on --custom properties."
    >
      <div class="stack">
        <div class="row">
          <label for="w">width</label>
          <input id="w" type="range" min="60" max="320" onInput={(event) => width(Number(event.currentTarget.value))} />
          <label for="h">hue</label>
          <input id="h" type="range" min="0" max="360" onInput={(event) => hue(Number(event.currentTarget.value))} />
        </div>
        <div
          style={() => ({
            width: width(),
            height: 40,
            borderRadius: 8,
            background: `hsl(${hue()} 70% 55%)`,
            opacity: 0.9,
          })}
        />
        <Out>{() => `{ width: ${width()}, height: 40 } → width: ${width()}px; height: 40px`}</Out>
      </div>
    </Section>
  )
}

/** `show` — mini's built-in visibility toggle, wired to `bindShow`. */
const Visibility = (): HTMLElement => {
  const open = signal(true)

  return (
    <Section
      title="show"
      blurb="Toggles inline display and remembers what the element asked for, so it is restored rather than reset to block. It hides in place — for genuine add/remove, use Show or list."
    >
      <div class="stack">
        <div class="row">
          <button type="button" onClick={() => open(!open())}>
            {() => (open() ? 'hide' : 'show')}
          </button>
          <span class="pill" show={open}>
            still in the DOM, just display:none
          </span>
        </div>
      </div>
    </Section>
  )
}

/** `ref` — the element-extension seam, and the reason there are no event options. */
const Refs = (): HTMLElement => {
  const size = signal('—')

  return (
    <Section
      title="ref"
      blurb="Called with the finished element after its children are appended. It is the escape hatch for anything with no prop form: extra listeners, focus management, measurement, a one-off bind* call."
    >
      <div class="stack">
        <div
          class="out"
          ref={(element) => {
            // A ResizeObserver has no prop form and never will — this is exactly
            // what `ref` is for, and `onCleanup` is how it stops when the route
            // changes and this page is disposed.
            const observer = new ResizeObserver(([entry]) => {
              if (entry) size(`${Math.round(entry.contentRect.width)} × ${Math.round(entry.contentRect.height)}`)
            })
            observer.observe(element)
            onCleanup(() => observer.disconnect())
          }}
        >
          {() => `resize the window — this box measures ${size()}`}
        </div>
      </div>
    </Section>
  )
}
