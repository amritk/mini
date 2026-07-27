import { computed, signal } from '@amritk/mini'
import { Dynamic, For, Match, Show, Switch } from '@amritk/mini/flow'

import { Out, Page, Section } from '../lib/ui'

/**
 * `@amritk/mini/flow` — the control-flow components the core deliberately
 * omits. Each is built on a core primitive (`bindShow`, `list`, a scoped
 * effect) and lives on its own subpath, so the byte-budgeted `.` entry gains
 * nothing from their existence.
 */
export const FlowPage = (): HTMLElement => (
  <Page
    title="Control flow"
    lede="Show, Switch/Match, For and Dynamic. Structural changes here are real add and remove — a branch that leaves is disposed, not hidden, and the one that arrives is built from scratch."
  >
    <ShowDemo />
    <NarrowingShow />
    <SwitchDemo />
    <ForDemo />
    <DynamicDemo />
  </Page>
)

/** `<Show>` — one branch or the other, with disposal in between. */
const ShowDemo = (): HTMLElement => {
  const open = signal(false)
  const built = signal(0)

  const Panel = (): HTMLElement => {
    // Runs on every entry, because the branch is genuinely rebuilt. A node
    // passed directly (rather than a factory) would be reused instead.
    built(built() + 1)
    return <div class="out">{() => `panel built ${built()} time(s)`}</div>
  }

  return (
    <Section
      title="Show"
      blurb="A zero-argument factory is lazy and rebuilt on re-entry; passing a node instead reuses it and preserves its state. Both forms tear the outgoing branch down."
    >
      <div class="stack">
        <button type="button" onClick={() => open(!open())}>
          {() => (open() ? 'collapse' : 'expand')}
        </button>
        <Show when={open} fallback={() => <div class="muted">nothing is mounted right now</div>}>
          {() => <Panel />}
        </Show>
      </div>
    </Section>
  )
}

/** `<Show>` with the narrowed value — no repeated signal read, no null check. */
type Session = { readonly user: string; readonly since: string }

const NarrowingShow = (): HTMLElement => {
  const session = signal<Session | null>(null)

  return (
    <Section
      title="Show, narrowed"
      blurb="The child may take one argument: a getter for the value that satisfied when, with null and undefined already removed from its type. The branch reads user() without re-checking anything."
    >
      <div class="stack">
        <div class="row">
          <button type="button" onClick={() => session({ user: 'ada', since: new Date().toLocaleTimeString() })}>
            sign in
          </button>
          <button type="button" onClick={() => session(null)}>
            sign out
          </button>
        </div>
        <Show when={session} fallback={() => <div class="muted">signed out</div>}>
          {(user) => <div class="out">{() => `signed in as ${user().user}, since ${user().since}`}</div>}
        </Show>
      </div>
    </Section>
  )
}

/** `<Switch>` / `<Match>` — first truthy branch wins. */
const SwitchDemo = (): HTMLElement => {
  const state = signal<'idle' | 'loading' | 'error' | 'ready'>('idle')

  return (
    <Section
      title="Switch / Match"
      blurb="Branches are tried in source order and only the winner is built — a Match that never matches never runs its factory."
    >
      <div class="stack">
        <div class="row">
          <button type="button" onClick={() => state('idle')}>
            idle
          </button>
          <button type="button" onClick={() => state('loading')}>
            loading
          </button>
          <button type="button" onClick={() => state('error')}>
            error
          </button>
          <button type="button" onClick={() => state('ready')}>
            ready
          </button>
        </div>
        <Switch fallback={() => <div class="muted">no branch matched</div>}>
          <Match when={() => state() === 'loading'}>{() => <div class="out">loading…</div>}</Match>
          <Match when={() => state() === 'error'}>
            {() => (
              <div class="out">
                <span class="pill bad">something broke</span>
              </div>
            )}
          </Match>
          <Match when={() => state() === 'ready'}>
            {() => (
              <div class="out">
                <span class="pill good">ready</span>
              </div>
            )}
          </Match>
        </Switch>
      </div>
    </Section>
  )
}

/** `<For>` — `list` with a default key, plus a supplied one when rows reorder. */
type Task = { readonly id: string; readonly title: string; readonly done: boolean }

const SEED: readonly Task[] = [
  { id: 'a', title: 'read the charter', done: true },
  { id: 'b', title: 'ship the playground', done: false },
  { id: 'c', title: 'port the host', done: false },
]

const ForDemo = (): HTMLElement => {
  const tasks = signal<readonly Task[]>(SEED)
  const remaining = computed(() => tasks().filter((task) => !task.done).length)

  const toggle = (id: string): void =>
    tasks(tasks().map((task) => (task.id === id ? { ...task, done: !task.done } : task)))

  const shuffle = (): void => tasks([...tasks()].reverse())

  const add = (): void =>
    tasks([...tasks(), { id: `t${tasks().length + 1}${Date.now() % 1000}`, title: 'a new task', done: false }])

  return (
    <Section
      title="For"
      blurb="Rows are keyed, so reordering moves the existing nodes rather than rebuilding them. Toggle a row, then reverse the list — the checkbox state travels with its data because the key does."
    >
      <div class="stack">
        <div class="row spread">
          <div class="row">
            <button type="button" onClick={add}>
              add
            </button>
            <button type="button" onClick={shuffle}>
              reverse
            </button>
            <button type="button" onClick={() => tasks([])}>
              clear
            </button>
            <button type="button" onClick={() => tasks(SEED)}>
              reset
            </button>
          </div>
          <span class="pill">{() => `${remaining()} remaining`}</span>
        </div>
        {/* `as` names the CONTAINER the rows are reconciled into, so the rows
            below are direct children of a real <ul> — which is what a
            `> li` selector (or a divide-y rule) needs to see. */}
        <For
          each={tasks}
          key={(task) => task.id}
          as="ul"
          class="list"
          fallback={() => <div class="muted">nothing left to do</div>}
        >
          {(task) => {
            // Built once per row. The row reads the live list rather than the
            // `task` it was created with, so a toggle reaches the node that
            // already exists instead of rebuilding it.
            const done = computed(() => tasks().find((row) => row.id === task.id)?.done ?? false)
            return (
              <li>
                <label class="row">
                  <input type="checkbox" checked={done} onChange={() => toggle(task.id)} />
                  <span class={() => (done() ? 'done' : '')}>{task.title}</span>
                </label>
                <span class="muted">#{task.id}</span>
              </li>
            )
          }}
        </For>
      </div>
    </Section>
  )
}

/** `<Dynamic>` — the component (or tag) itself chosen at runtime. */
const Callout = (props: { readonly tone: () => string }): HTMLElement => (
  <div class="out">{() => `a component picked at runtime — tone: ${props.tone()}`}</div>
)

const Plain = (props: { readonly tone: () => string }): HTMLElement => (
  <div class="muted">{() => `a different component, the same props — tone: ${props.tone()}`}</div>
)

const DynamicDemo = (): HTMLElement => {
  const fancy = signal(true)
  const tag = signal<'h3' | 'blockquote' | 'pre'>('h3')

  return (
    <Section
      title="Dynamic"
      blurb="Pass a tag name, or a getter that returns a component — the getter is required, because a bare component function is indistinguishable from a reactive getter when both are just functions."
    >
      <div class="stack">
        <div class="row">
          <button type="button" onClick={() => fancy(!fancy())}>
            swap component
          </button>
          <button
            type="button"
            onClick={() => tag(tag() === 'h3' ? 'blockquote' : tag() === 'blockquote' ? 'pre' : 'h3')}
          >
            swap tag
          </button>
        </div>
        <Dynamic component={() => (fancy() ? Callout : Plain)} tone={() => (fancy() ? 'loud' : 'quiet')} />
        <Dynamic component={tag}>rendered into a &lt;{tag}&gt;</Dynamic>
        <Out>{() => `component → ${fancy() ? 'Callout' : 'Plain'}\ntag → ${tag()}`}</Out>
      </div>
    </Section>
  )
}
