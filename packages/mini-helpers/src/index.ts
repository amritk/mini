/**
 * `@amritk/mini-helpers` — the helpers `@amritk/mini` and `@amritk/mini-lynx`
 * both need, factored out so they cannot drift apart.
 *
 * ## What belongs here, and what emphatically does not
 *
 * The two packages are siblings, not layers: neither imports the other, and
 * that independence is the design rather than an accident of history. It has
 * one cost, documented in `.claude/architecture.md` and paid twice already —
 * **a defect found in one is usually latent in the other**. This package pays
 * down that cost for the narrow band of code where sharing costs nothing back.
 *
 * The bar is deliberately high, and it is two rules:
 *
 * 1. **No reactivity.** Nothing here imports `alien-signals`, directly or
 *    transitively. A signal that crossed this boundary would make the two
 *    packages share a reactive graph through a third module, and a consumer
 *    installing a mismatched copy would get two graphs that cannot see each
 *    other's writes — a failure that typechecks and runs and simply stops
 *    updating.
 * 2. **No platform.** No DOM, no Node, no host. The tsconfig withholds both
 *    ambient libraries so this is a compiler constraint rather than a
 *    convention, exactly as `@amritk/mini-lynx` does it.
 *
 * What survives both rules is pure functions over strings and plain objects.
 * `src/purity.test.ts` walks the source graph and enforces it, so the charter
 * cannot erode one convenient import at a time.
 *
 * The runtime cores stay where they are: `signals`, `list`, `mount`, the JSX
 * runtimes and the bind helpers are genuinely different code — `@amritk/mini`
 * takes DOM fast paths (`textContent`, template cloning) that have no meaning
 * behind a `Host`. And `onCleanup`/`runDetached`, which ARE byte-identical
 * between the two, deliberately stay duplicated: they live in each package's
 * `.` entry, whose transitive imports must be `alien-signals` and nothing else
 * (see either package's `import-boundary.test.ts`). A shared dependency there
 * would be a byte the widget's bundle pays for.
 *
 * ## Entries
 *
 * This entry carries the helpers with **no dependencies at all** — route
 * pattern matching in both directions (`matchRoute`, `buildPath`, and the
 * `PathParams` type that ties them to the pattern), the base-prefix arithmetic
 * both routers now need, and query-string parsing. All of it is string
 * arithmetic. `@amritk/mini-helpers/schema` is separate because it reaches an
 * optional peer (`@amritk/runtime-validators`), and a consumer who does not
 * validate with JSON Schema should not have to install one to import this.
 */
export { buildPath } from './build-path'
export type { RouteParams } from './match-route'
export { matchRoute } from './match-route'
export { parseQuery } from './parse-query'
export type { PathParams } from './path-params'
export { stripBase } from './strip-base'
