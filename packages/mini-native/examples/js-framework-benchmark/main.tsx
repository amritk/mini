/** @jsxImportSource ../../src */
/**
 * A keyed [js-framework-benchmark](https://github.com/krausest/js-framework-benchmark)
 * implementation in `@amritk/mini-native` — the mirror of the one
 * [`@amritk/mini`](../../../mini/examples/js-framework-benchmark) grew, built out
 * of Lynx's own element vocabulary so the same create/update/reorder workload can
 * be timed against a fake engine or a real one.
 *
 * It is an example, not part of the published package. What it is FOR is the
 * number: the reconciler's move-minimal guarantee was previously asserted in
 * engine calls, which proves the algorithm and says nothing about the clock.
 * Driving this store against the fake engine — whose operations are array
 * splices on plain objects — measures very nearly the runtime's own overhead and
 * nothing else.
 *
 * ## One of `mini`'s four techniques is unavailable here, and that is the point
 *
 * **No template cloning.** `mini` clones a row from one parsed `<tr>`, so
 * *create* pays one `cloneNode` instead of a dozen `createElement`s. There is no
 * equivalent on Lynx: the Element PAPI has no HTML parser and no way to deep-copy
 * a subtree, so a row is built element by element. That is a real difference in
 * what the two runtimes can do rather than a gap in this example, and the
 * benchmark is where it should show up instead of being argued about.
 *
 * The rest carry over, and one of them carries over BETTER than it does on the
 * web:
 *
 * 1. **Keyed `list`** — the same move-minimal two-ended diff, so *swap rows* is
 *    one move, *remove row* is none, and row identity survives every reorder.
 * 2. **O(1) select** — selection is a signal PER ROW rather than one shared
 *    `selectedId` every row reads, so selecting in a ten-thousand-row list writes
 *    two signals and updates two class lists. `mini` does this imperatively with
 *    `classList`; a signal each is the same complexity and stays inside the
 *    graph, which is the shape this runtime prefers anyway.
 * 3. **Main-thread handlers.** `bindtap` registers a worklet the engine calls on
 *    the main thread, where the element tree already lives — so a tap writes a
 *    signal and lands on the tree within the frame, with no thread hop. A
 *    background-thread framework pays a round trip per tap, which is exactly the
 *    cost `main-thread:bindtap` exists to buy back by hand, one handler at a
 *    time.
 *
 * Only the label and the selected flag are reactive, so *partial update*
 * rewrites the touched text runs and never reconciles the list — the `rows` array
 * reference is unchanged, so the `list` effect does not re-run.
 */

import type { LynxElement } from '../../src/engine/element-api'
import { list } from '../../src/list'
import { type Signal, signal } from '../../src/signals'

/** One row: a stable id for keying, a reactive label, and its own selection flag. */
export type Row = {
  id: number
  label: Signal<string>
  /** Per row, not shared — see the note above on why selecting stays O(1). */
  selected: Signal<boolean>
}

const ADJECTIVES = [
  'pretty',
  'large',
  'big',
  'small',
  'tall',
  'short',
  'long',
  'handsome',
  'plain',
  'quaint',
  'clean',
  'elegant',
  'easy',
  'angry',
  'crazy',
  'helpful',
  'mushy',
  'odd',
  'unsightly',
  'adorable',
  'important',
  'inexpensive',
  'cheap',
  'expensive',
  'fancy',
]
const COLOURS = ['red', 'yellow', 'blue', 'green', 'pink', 'brown', 'purple', 'brown', 'white', 'black', 'orange']
const NOUNS = [
  'table',
  'chair',
  'house',
  'bbq',
  'desk',
  'car',
  'pony',
  'cookie',
  'sandwich',
  'burger',
  'pizza',
  'mouse',
  'keyboard',
]

const pick = <T,>(items: readonly T[]): T => items[Math.floor(Math.random() * items.length)] as T

/** The benchmark's "AdjectiveColourNoun" label, e.g. "elegant red keyboard". */
const randomLabel = (): string => `${pick(ADJECTIVES)} ${pick(COLOURS)} ${pick(NOUNS)}`

/** The store plus the operations the benchmark's buttons and row taps invoke. */
export type BenchmarkStore = {
  rows: () => readonly Row[]
  selectedId: () => number | null
  /** Create 1,000 rows, replacing whatever is there. */
  run: () => void
  /** Create 10,000 rows. */
  runLots: () => void
  /** Append 1,000 rows. */
  add: () => void
  /** Rewrite every tenth label in place. */
  update: () => void
  clear: () => void
  /** Swap the rows at index 1 and 998 — the reorder the two-ended diff exists for. */
  swapRows: () => void
  select: (id: number) => void
  remove: (id: number) => void
}

/**
 * Builds the benchmark UI and returns its root element plus the store driving
 * it.
 *
 * An engine must be installed first. Mount `element` to run it interactively, or
 * call the store operations directly to exercise each measured path — which is
 * what a timing harness should do, so the numbers cover the runtime rather than
 * whatever a synthetic tap costs.
 */
export const createBenchmarkApp = (): { element: LynxElement; store: BenchmarkStore } => {
  const rows = signal<readonly Row[]>([])
  let nextId = 1
  // Tracked as a plain variable rather than a signal: nothing renders it, and a
  // signal here would be one more thing every select had to notify.
  let selected: Row | null = null

  const buildRows = (count: number): Row[] =>
    Array.from({ length: count }, () => ({ id: nextId++, label: signal(randomLabel()), selected: signal(false) }))

  const setSelected = (row: Row | null): void => {
    if (selected === row) return
    // Exactly two writes, whatever the list's length. A shared `selectedId`
    // signal read by every row's class would make this O(n) — a thousand effects
    // re-running to change one class.
    selected?.selected(false)
    row?.selected(true)
    selected = row
  }

  const store: BenchmarkStore = {
    rows,
    selectedId: () => selected?.id ?? null,
    run: () => {
      setSelected(null)
      rows(buildRows(1000))
    },
    runLots: () => {
      setSelected(null)
      rows(buildRows(10000))
    },
    add: () => rows([...rows(), ...buildRows(1000)]),
    update: () => {
      const data = rows()
      // Every tenth label, rewritten in place. The array reference is unchanged,
      // so `list` never reconciles — only the touched text bindings fire.
      for (let i = 0; i < data.length; i += 10) {
        const row = data[i] as Row
        row.label(`${row.label()} !!!`)
      }
    },
    clear: () => {
      setSelected(null)
      rows([])
    },
    swapRows: () => {
      const data = rows()
      if (data.length <= 998) return
      const next = data.slice()
      const one = next[1] as Row
      next[1] = next[998] as Row
      next[998] = one
      rows(next)
    },
    select: (id) => setSelected(rows().find((row) => row.id === id) ?? null),
    remove: (id) => {
      if (selected?.id === id) setSelected(null)
      rows(rows().filter((row) => row.id !== id))
    },
  }

  /**
   * Builds one row.
   *
   * Element by element, because there is nothing to clone from — see the note at
   * the top. The id and the label are separate `<text>` elements each holding
   * their own `raw-text`, which is what a run of text IS on Lynx; only the label
   * one is bound, so a partial update rewrites a single `text` attribute.
   */
  const createRow = (row: Row): LynxElement => (
    <view
      class={() => (row.selected() ? 'row danger' : 'row')}
      data-testid={`row-${row.id}`}
      bindtap={() => store.select(row.id)}
    >
      <text class="col-id">
        <raw-text text={String(row.id)} />
      </text>
      <text class="col-label">
        <raw-text text={row.label} />
      </text>
      <view class="col-remove" data-testid={`remove-${row.id}`} bindtap={() => store.remove(row.id)}>
        <text>
          <raw-text text="✕" />
        </text>
      </view>
    </view>
  )

  const controls = (
    <view class="controls">
      <view data-testid="run" bindtap={store.run}>
        <text>Create 1,000 rows</text>
      </view>
      <view data-testid="runlots" bindtap={store.runLots}>
        <text>Create 10,000 rows</text>
      </view>
      <view data-testid="add" bindtap={store.add}>
        <text>Append 1,000 rows</text>
      </view>
      <view data-testid="update" bindtap={store.update}>
        <text>Update every 10th row</text>
      </view>
      <view data-testid="clear" bindtap={store.clear}>
        <text>Clear</text>
      </view>
      <view data-testid="swaprows" bindtap={store.swapRows}>
        <text>Swap Rows</text>
      </view>
    </view>
  )

  // A real `scroll-view` rather than a wrapper, because the rows have to scroll
  // and a wrapper takes no part in layout at all.
  const body = <scroll-view class="rows" data-testid="rows" scroll-orientation="vertical" />
  list(body, rows, (row) => String(row.id), createRow)

  return {
    element: (
      <view class="benchmark">
        {controls}
        {body}
      </view>
    ),
    store,
  }
}
