import { batch, bindValue, computed, effect, onCleanup, signal, watch } from '@amritk/mini'

import { Out, Page, Section } from '../lib/ui'

/**
 * Reactivity on its own, before any DOM is involved: read, write, derive,
 * group, observe, tear down. Everything the rest of the playground does is
 * these five things pointed at an element.
 */
export const SignalsPage = (): HTMLElement => (
  <Page
    title="Signals"
    lede="alien-signals with a one-function API: call it to read, call it with a value to write. computed derives, effect observes, batch groups, watch reacts to changes only, and onCleanup tears down."
  >
    <ReadWrite />
    <Derived />
    <Batching />
    <Watching />
    <Scopes />
  </Page>
)

/** `signal()` — the whole read/write surface. There is no `.value` and no `.set`. */
const ReadWrite = (): HTMLElement => {
  const count = signal(0)

  return (
    <Section title="signal" blurb="count() reads. count(next) writes. That is the entire API.">
      <div class="stack">
        <div class="row">
          <button type="button" onClick={() => count(count() - 1)}>
            −1
          </button>
          <button type="button" onClick={() => count(count() + 1)}>
            +1
          </button>
          <button type="button" onClick={() => count(0)}>
            reset
          </button>
        </div>
        <Out>{() => `count() → ${count()}`}</Out>
      </div>
    </Section>
  )
}

/** `computed()` — derived state that recomputes lazily and caches. */
const Derived = (): HTMLElement => {
  const first = signal('Ada')
  const last = signal('Lovelace')
  const full = computed(() => `${first()} ${last()}`.trim())
  const initials = computed(() =>
    full()
      .split(' ')
      .filter(Boolean)
      .map((part) => part[0])
      .join(''),
  )

  return (
    <Section
      title="computed"
      blurb="A computed reads other signals and caches until one of them changes. Computeds compose — initials derives from full, which derives from two inputs."
    >
      <div class="stack">
        <div class="row">
          <label for="first">First</label>
          <input id="first" ref={(element) => bindValue(element, first)} />
          <label for="last">Last</label>
          <input id="last" ref={(element) => bindValue(element, last)} />
        </div>
        <Out>{() => `full()     → ${full()}\ninitials() → ${initials()}`}</Out>
      </div>
    </Section>
  )
}

/** `batch()` — one propagation pass for several writes. */
const Batching = (): HTMLElement => {
  const x = signal(0)
  const y = signal(0)
  const runs = signal(0)

  // The counter is a plain local rather than a read of `runs` — reading the
  // signal it writes inside its own effect would make the effect depend on
  // itself and loop forever.
  let ran = 0
  effect(() => {
    x()
    y()
    ran += 1
    runs(ran)
  })

  const bump = (): void => {
    x(x() + 1)
    y(y() + 1)
  }

  const bumpBatched = (): void => {
    batch(() => {
      x(x() + 1)
      y(y() + 1)
    })
  }

  return (
    <Section
      title="batch"
      blurb="Effects run synchronously, so two plain writes propagate twice. Wrapped in batch they propagate once — watch how much slower the effect-run counter climbs."
    >
      <div class="stack">
        <div class="row">
          <button type="button" onClick={bump}>
            write twice
          </button>
          <button type="button" onClick={bumpBatched}>
            write twice, batched
          </button>
        </div>
        <Out>{() => `x=${x()}  y=${y()}\neffect runs: ${runs()}`}</Out>
      </div>
    </Section>
  )
}

/** `watch()` — change-only, with the callback outside the tracking scope. */
const Watching = (): HTMLElement => {
  const query = signal('')
  const log = signal<readonly string[]>([])

  // Only `query` is tracked: the callback reads and writes `log` without making
  // it a dependency, which is what stops the watcher re-firing on its own work.
  watch(query, (next, previous) => log([`"${previous}" → "${next}"`, ...log()].slice(0, 6)))

  return (
    <Section
      title="watch"
      blurb="Fires on change, not on setup — nothing is logged until you type. Pass { immediate: true } when the current value should run it too."
    >
      <div class="stack">
        <input placeholder="type to fire the watcher…" ref={(element) => bindValue(element, query)} />
        <Out>{() => (log().length === 0 ? '(no changes yet)' : log().join('\n'))}</Out>
      </div>
    </Section>
  )
}

/** `effect()` + `onCleanup()` — a subscription that dies with its owner. */
const Scopes = (): HTMLElement => {
  const ticking = signal(false)
  const ticks = signal(0)

  let timer: ReturnType<typeof setInterval> | undefined
  const stopTimer = (): void => {
    if (timer !== undefined) clearInterval(timer)
    timer = undefined
  }

  effect(() => {
    stopTimer()
    if (ticking()) timer = setInterval(() => ticks(ticks() + 1), 250)
  })

  // The component runs inside `mount`'s effectScope, so this fires when the
  // route changes and the page is torn down — leave it ticking and navigate away.
  onCleanup(stopTimer)

  return (
    <Section
      title="effect + onCleanup"
      blurb="An effect re-runs whenever a signal it read changes. onCleanup registers teardown against the enclosing mount/list scope, so a running interval cannot outlive the page that started it."
    >
      <div class="stack">
        <div class="row">
          <button type="button" onClick={() => ticking(!ticking())}>
            {() => (ticking() ? 'stop' : 'start')}
          </button>
          <button type="button" onClick={() => ticks(0)}>
            reset
          </button>
        </div>
        <Out>{() => `ticking: ${ticking()}\nticks:   ${ticks()}`}</Out>
      </div>
    </Section>
  )
}
