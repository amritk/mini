import { createBenchmarkApp } from '../packages/mini-lynx/examples/js-framework-benchmark/main'
import { clearEngine, setEngine } from '../packages/mini-lynx/src/engine/current-engine'
import type { LynxElementApi } from '../packages/mini-lynx/src/engine/element-api'
import { mount } from '../packages/mini-lynx/src/mount'
import { createFakeEngine } from '../packages/mini-lynx/src/testing/create-fake-engine'

/**
 * bench-reconciler — a wall-clock number for the operations
 * `@amritk/mini-lynx`'s keyed list actually performs.
 *
 * The reconciler already carries a move-minimal guarantee, and that guarantee is
 * asserted in HOST CALLS: swapping two rows costs two inserts, removing from the
 * middle costs none. That proves the algorithm and says nothing about the clock —
 * an O(1) operation is still slow if the constant is. This runs the
 * js-framework-benchmark workload against the memory host and times it.
 *
 * **Why the memory host, when nobody ships one.** Its operations are array
 * splices and property writes on plain objects, so what is left in the number is
 * very nearly the runtime's own overhead: building rows, tracking effects,
 * diffing key order. That is exactly the thing this package can be held
 * responsible for. A number from the DOM or from a device would be dominated by
 * that platform's layout and commit costs, which move with the browser version
 * and the phone, and would tell you far more about them than about this code. To
 * measure a real target, put `examples/js-framework-benchmark` into the actual
 * benchmark harness — that is what the harness is for and this is not trying to
 * replace it.
 *
 * The host-call column is printed alongside, because a millisecond figure is
 * only interpretable next to the amount of work it covers — and because it is
 * where a reconciler regression shows up first and most legibly.
 *
 * Usage:
 *   bun run scripts/bench-reconciler.ts [--repeats 10] [--json]
 */

const args = process.argv.slice(2)
const argValue = (flag: string): string | undefined => {
  const index = args.indexOf(flag)
  return index === -1 ? undefined : args[index + 1]
}

/** How many timed runs per case. The median of these is reported. */
const REPEATS = Number(argValue('--repeats') ?? 10)
const asJson = args.includes('--json')

/** The host operations worth counting — the ones a reconciler is judged on. */
/**
 * The engine calls worth counting: the ones the reconciler makes, named as the
 * PAPI names them.
 *
 * `__SetAttribute` covers both a property write and a text update, since a text
 * run in Lynx is an element whose `text` attribute changes — so a column that
 * used to separate `setText` from `setProperty` would now be splitting one
 * engine call into two names it does not have.
 */
const COUNTED = [
  '__CreateElement',
  '__CreateRawText',
  '__CreateWrapperElement',
  '__AppendElement',
  '__InsertElementBefore',
  '__RemoveElement',
  '__SetAttribute',
  '__SetClasses',
] as const

type Counts = Record<(typeof COUNTED)[number], number>

const zeroCounts = (): Counts => ({
  __CreateElement: 0,
  __CreateRawText: 0,
  __CreateWrapperElement: 0,
  __AppendElement: 0,
  __InsertElementBefore: 0,
  __RemoveElement: 0,
  __SetAttribute: 0,
  __SetClasses: 0,
})

/**
 * Wraps an engine so every counted call increments a tally.
 *
 * Deliberately a wrapper rather than an option on the fake engine: that engine
 * is the reference implementation of the PAPI, and a counting mode inside it
 * would be a feature every future reader of it had to skip past.
 *
 * Counting ENGINE calls rather than wall-clock alone is the more durable half
 * of this benchmark. A timing regression can be a slower machine; an extra
 * `__InsertElementBefore` per row is the reconciler doing more work, and on a
 * device each one of those is a real mutation with a real cost.
 */
const counting = (engine: LynxElementApi, counts: Counts): LynxElementApi => {
  const wrapped = { ...engine } as Record<string, unknown>
  for (const name of COUNTED) {
    const original = engine[name] as (...call: unknown[]) => unknown
    wrapped[name] = (...call: unknown[]) => {
      counts[name] += 1
      return original.apply(engine, call)
    }
  }
  return wrapped as LynxElementApi
}

type Case = {
  name: string
  /** Puts the tree into the state the timed operation starts from. Not measured. */
  setup: (store: Store) => void
  run: (store: Store) => void
  /** Fewer repeats for the ten-thousand-row cases, which are slow and low-variance. */
  repeats?: number
}

type Store = ReturnType<typeof createBenchmarkApp>['store']

/**
 * The js-framework-benchmark operation set, less the ones that measure a
 * platform rather than a runtime.
 *
 * `select row` is here because it is the case a naive signals implementation
 * gets quadratically wrong — one shared `selectedId` every row reads makes
 * selecting cost a thousand effect runs — and a benchmark that omitted it would
 * be flattering.
 */
const CASES: readonly Case[] = [
  { name: 'create 1,000 rows', setup: (store) => store.clear(), run: (store) => store.run() },
  { name: 'replace all 1,000 rows', setup: (store) => store.run(), run: (store) => store.run() },
  { name: 'partial update (every 10th)', setup: (store) => store.run(), run: (store) => store.update() },
  { name: 'select row', setup: (store) => store.run(), run: (store) => store.select(store.rows()[500]?.id ?? 0) },
  { name: 'swap rows', setup: (store) => store.run(), run: (store) => store.swapRows() },
  { name: 'remove row', setup: (store) => store.run(), run: (store) => store.remove(store.rows()[500]?.id ?? 0) },
  { name: 'clear 1,000 rows', setup: (store) => store.run(), run: (store) => store.clear() },
  { name: 'create 10,000 rows', setup: (store) => store.clear(), run: (store) => store.runLots(), repeats: 3 },
  { name: 'append 1,000 to 10,000', setup: (store) => store.runLots(), run: (store) => store.add(), repeats: 3 },
]

type Result = { name: string; median: number; counts: Counts }

/** The middle value, which resists the one slow run a garbage collection causes. */
const median = (samples: readonly number[]): number => {
  const sorted = [...samples].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0
    ? ((sorted[middle - 1] as number) + (sorted[middle] as number)) / 2
    : (sorted[middle] as number)
}

/**
 * Times one case.
 *
 * A fresh host and a fresh mount per sample, so no run inherits the previous
 * one's tree — reusing a tree would let a later `create` benefit from scopes the
 * earlier one had already built, which is how a benchmark quietly measures its
 * own warm-up.
 *
 * The first sample is discarded as warm-up: the JIT has not seen the reconciler
 * yet on the first pass, and reporting that as the cost of creating a thousand
 * rows would be blaming this code for the engine's tiering.
 */
const measure = (benchmark: Case): Result => {
  const samples: number[] = []
  const counts = zeroCounts()

  const repeats = (benchmark.repeats ?? REPEATS) + 1
  for (let attempt = 0; attempt < repeats; attempt++) {
    const engine = createFakeEngine()
    const attemptCounts = zeroCounts()
    setEngine(counting(engine.api, attemptCounts))

    const app = createBenchmarkApp()
    const dispose = mount(engine.pageElement, () => app.element)
    benchmark.setup(app.store)

    // Counted from here, so setup's own tree building does not land in the
    // column next to the timed operation.
    for (const name of COUNTED) attemptCounts[name] = 0
    const started = performance.now()
    benchmark.run(app.store)
    const elapsed = performance.now() - started

    if (attempt > 0) {
      samples.push(elapsed)
      for (const name of COUNTED) counts[name] = attemptCounts[name]
    }

    dispose()
    clearEngine()
  }

  return { name: benchmark.name, median: median(samples), counts }
}

const results = CASES.map(measure)

if (asJson) {
  console.log(JSON.stringify({ repeats: REPEATS, results }, null, 2))
} else {
  const engineCalls = (counts: Counts): number => COUNTED.reduce((total, name) => total + counts[name], 0)
  const rows = results.map((result) => ({
    Operation: result.name,
    'Median (ms)': result.median.toFixed(2),
    'Engine calls': String(engineCalls(result.counts)),
    Created: String(
      result.counts.__CreateElement + result.counts.__CreateRawText + result.counts.__CreateWrapperElement,
    ),
    Inserts: String(result.counts.__AppendElement + result.counts.__InsertElementBefore),
    Removals: String(result.counts.__RemoveElement),
    Writes: String(result.counts.__SetAttribute + result.counts.__SetClasses),
  }))

  const columns = Object.keys(rows[0] as object)
  const width = (column: string): number => Math.max(column.length, ...rows.map((row) => (row as never)[column].length))
  const line = (cells: readonly string[]): string =>
    `| ${cells.map((cell, index) => cell.padEnd(width(columns[index] as string))).join(' | ')} |`

  console.log(`mini-lynx reconciler, fake Lynx engine, median of ${REPEATS}\n`)
  console.log(line(columns))
  console.log(`|${columns.map((column) => '-'.repeat(width(column) + 2)).join('|')}|`)
  for (const row of rows) console.log(line(columns.map((column) => (row as never)[column])))
}
