import { computed, list, onCleanup, signal } from '@amritk/mini'

import { Out, Page, Section } from '../lib/ui'

/**
 * `list()` — the only reconciler mini has. Everything else in the package is a
 * binding that writes one property; this is the one place nodes are created,
 * moved and destroyed in response to data.
 */
export const ListsPage = (): HTMLElement => (
  <Page
    title="Keyed lists"
    lede="list(container, items, key, create) owns its container outright. It creates a node per key, moves the ones whose position genuinely changed, and disposes the ones whose key is gone — taking each row's own effects and onCleanup handlers with it."
  >
    <Identity />
    <Churn />
  </Page>
)

type Row = { readonly id: string; readonly name: string; readonly score: number }

const SEED: readonly Row[] = [
  { id: 'r1', name: 'ada', score: 91 },
  { id: 'r2', name: 'grace', score: 88 },
  { id: 'r3', name: 'alan', score: 84 },
  { id: 'r4', name: 'edsger', score: 77 },
]

/**
 * Keys decide node identity, and node identity decides which per-row state
 * survives — the clearest way to show that is to put real state in a row.
 */
const Identity = (): HTMLElement => {
  const rows = signal<readonly Row[]>(SEED)

  const byScore = (): void => rows([...rows()].sort((a, b) => b.score - a.score))
  const byName = (): void => rows([...rows()].sort((a, b) => a.name.localeCompare(b.name)))
  const reverse = (): void => rows([...rows()].reverse())

  return (
    <Section
      title="Keys are identity"
      blurb="Click a few rows to give them local state, then re-sort. The counters travel with their rows because the key does — the nodes are moved, not rebuilt."
    >
      <div class="stack">
        <div class="row">
          <button type="button" onClick={byScore}>
            sort by score
          </button>
          <button type="button" onClick={byName}>
            sort by name
          </button>
          <button type="button" onClick={reverse}>
            reverse
          </button>
          <button type="button" onClick={() => rows(SEED)}>
            reset
          </button>
        </div>
        <ul
          class="list"
          ref={(container) => {
            // The container belongs to the list and nothing else may append to
            // it — that ownership is what lets the reconciler treat child order
            // as its own bookkeeping.
            list(
              container,
              rows,
              (row) => row.id,
              (row) => {
                // Per-row state, created once when this key first appears and
                // disposed when it leaves. Nothing above the row knows it exists.
                const clicks = signal(0)
                return (
                  <li>
                    <span>{`${row.name} · ${row.score}`}</span>
                    <button type="button" onClick={() => clicks(clicks() + 1)}>
                      {() => `clicked ${clicks()}×`}
                    </button>
                  </li>
                )
              },
            )
          }}
        />
      </div>
    </Section>
  )
}

/** Add, remove, and the empty state — the structural half. */
const Churn = (): HTMLElement => {
  const rows = signal<readonly Row[]>(SEED)
  const live = signal(0)
  const total = computed(() => rows().length)

  // A plain counter, mirrored into the signal. `create` runs inside the list's
  // own tracking effect, so reading `live()` in there would make the list depend
  // on a signal it writes — the effect would re-run itself forever.
  let scopes = 0
  const countScopes = (delta: number): void => {
    scopes += delta
    live(scopes)
  }

  let next = 5

  const add = (): void => {
    const id = `r${next++}`
    rows([{ id, name: `row ${id}`, score: Math.round(Math.random() * 100) }, ...rows()])
  }

  const drop = (id: string): void => rows(rows().filter((row) => row.id !== id))

  return (
    <Section
      title="Create and dispose"
      blurb="Every row opens its own effectScope. The live counter is incremented when a row is created and decremented from its onCleanup, so it is a direct readout of how many scopes the list is holding."
    >
      <div class="stack">
        <div class="row spread">
          <div class="row">
            <button type="button" onClick={add}>
              add row
            </button>
            <button type="button" onClick={() => rows([])}>
              clear
            </button>
            <button type="button" onClick={() => rows(SEED)}>
              reset
            </button>
          </div>
          <span class="pill">{() => `${live()} live scopes`}</span>
        </div>
        <ul
          class="list"
          ref={(container) => {
            list(
              container,
              rows,
              (row) => row.id,
              (row) => {
                // `create` runs inside the row's own effectScope, which is what
                // makes `onCleanup` here mean "when this key leaves the list".
                countScopes(1)
                onCleanup(() => countScopes(-1))
                return (
                  <li>
                    <span>{`${row.name} · ${row.score}`}</span>
                    <button type="button" onClick={() => drop(row.id)}>
                      remove
                    </button>
                  </li>
                )
              },
            )
          }}
        />
        <Out>{() => `rows: ${total()}`}</Out>
      </div>
    </Section>
  )
}
