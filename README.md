<div align="center">

# mini

**A deliberately tiny signals UI runtime. Real nodes, created once, mutated forever by signals — no virtual DOM, no diffing, no re-render.**

![status](https://img.shields.io/badge/status-pre--alpha-ef4444?style=flat-square)&nbsp;
![license](https://img.shields.io/badge/license-MIT-22c55e?style=flat-square)&nbsp;
![deps](https://img.shields.io/badge/deps-1%20(alien--signals)-f97316?style=flat-square)&nbsp;
![vibe coded](https://img.shields.io/badge/vibe-coded-a855f7?style=flat-square)

</div>

---

## What is mini?

A UI runtime small enough to read in an afternoon, built on
[alien-signals](https://github.com/stackblitz/alien-signals). It ships in two
shapes:

| Package | What it renders to |
|---|---|
| **[`@amritk/mini`](./packages/mini)** | The DOM. Reactive bindings, keyed lists, static-template cloning, and a compilerless JSX runtime. |
| **[`@amritk/mini-lynx`](./packages/mini-lynx)** | **Lynx**, through its Element PAPI. The engine's own elements, attributes and events — no vocabulary in between. |

A third package, **[`@amritk/mini-helpers`](./packages/mini-helpers)**, holds the
handful of helpers that turned out identical in both — route matching, query
parsing, JSON Schema compilation. Both packages depend on it and re-export it, so
you never import it directly; it is separate only because its charter is worth
enforcing: **no reactivity, no platform.**

Both are compilerless: there is no custom build step, just the standard
`react-jsx` transform pointed at the package's own runtime.

## The one idea

**JSX builds a real node once. Signals mutate it forever. Nothing diffs.**

```tsx
const Counter = () => {
  const count = signal(0)
  return (
    <button onclick={() => count(count() + 1)}>
      {() => `clicked ${count()} times`}
    </button>
  )
}
```

The component function runs a **single time**. The `<button>` is created once
and never rebuilt; only the text node inside it is ever written to again.

### The reactivity rule

Nothing analyses your expressions, so reactivity is decided by **value shape at
runtime**:

- A **function-valued** attribute, child, or `show` is reactive.
- Any **other value** is static — applied once, never again.

Signals are zero-argument functions, so passing one **without calling it** is
already a live binding:

```tsx
<button disabled={streaming}>      {/* reactive — tracks forever    */}
<button disabled={streaming()}>    {/* STATIC — frozen at creation! */}
```

That second line is the one real footgun, so it is guarded three ways: live in
the editor and dev server through `@amritk/mini/vite`, in this repo's CI through
`bun run check:reactivity`, and in your own CI through the same plugin.

## The cap is the design

There is no virtual DOM, no diffing, and no re-render — and that is a
commitment, not a roadmap item. It buys two things:

- **The `.` entry stays tiny and flat.** Every feature only some apps need lives
  on its own subpath with its own module graph, so importing `/router` pulls in
  none of `/forms`. A size-budget test and an import-boundary test hold that
  line in CI, per package.
- **Do not rebuild what the target already does.** `@amritk/mini-lynx` used to
  own a platform-neutral vocabulary and a pluggable host so a component could run
  anywhere. Lynx already solves that one layer down, so the package dropped the
  abstraction and became a thin layer over the engine — about 5,000 lines lighter,
  and with the ceiling moved from "what this package has named" to "what the
  engine can do". See [`docs/mini-lynx-runtime.md`](./docs/mini-lynx-runtime.md).

If a feature seems to be missing, the correct next step is usually a bigger
framework (Preact, Solid), not a new helper here.

## Quick start

```bash
npm install @amritk/mini
# or: pnpm add / yarn add / bun add
```

```jsonc
// tsconfig.json
{
  "compilerOptions": {
    "jsx": "react-jsx",
    "jsxImportSource": "@amritk/mini"
  }
}
```

```tsx
import { mount, signal } from '@amritk/mini'

mount(document.body, Counter)
```

Full API, subpath modules, and the native runtime's host contract are in the
package READMEs:

- [`@amritk/mini`](./packages/mini/README.md) — DOM bindings, `list`,
  `template`, and the `/router` `/flow` `/forms` `/query` `/hot` `/vite`
  subpaths.
- [`@amritk/mini-lynx`](./packages/mini-lynx/README.md) — the Lynx element
  vocabulary, `renderPage`, the in-memory Element PAPI for tests, and the
  `/flow` `/composition` `/router` `/forms` `/query` `/engine` `/testing`
  subpaths.
- [`@amritk/mini-helpers`](./packages/mini-helpers/README.md) — the pure helpers
  both of the above share, and the bar for adding to them.

## Playgrounds

Two kitchen-sink demos live in [`apps/`](./apps), each exercising every public
entry point of its package and deployed to Cloudflare Workers as a static SPA:

- [`playground-mini`](./apps/playground-mini/README.md) — signals, the JSX
  runtime, every binding, `/flow`, `/forms`, `/query`, and `/router` (which the
  app itself runs on).
- [`playground-mini-lynx`](./apps/playground-mini-lynx/README.md) — Lynx
  elements, CSS, `<list>`, event propagation, `/flow`, `/composition`, `/forms`,
  `/query` and `/router`, previewed through a **DOM implementation of Lynx's
  Element PAPI**. Its `/engine` screen renders a second tree through the
  in-memory PAPI and prints the call log, so the reconciler's cost is countable.

```sh
bun run --filter '@amritk/playground-mini' dev
bun run --filter '@amritk/playground-mini-lynx' dev
```

## For AI agents & LLMs

Each package ships an **`AI.md`** next to its `README.md`: a mental model, a
minimal runnable example, and the gotchas most likely to trip up a model. The
repo root carries [`llms.txt`](./llms.txt) (a curated index, per
[llmstxt.org](https://llmstxt.org)) and [`llms-full.txt`](./llms-full.txt)
(every `AI.md` inlined, for pasting into context).

Editing the repo rather than consuming it? Start at [`AGENTS.md`](./AGENTS.md),
then the per-package `AGENTS.md` for the invariants that package cannot break.

## Requirements

- **Consumers:** any ES2022 runtime. `@amritk/mini` needs a DOM;
  `@amritk/mini-lynx` needs only a host.
- **Development:** [Bun](https://bun.sh) ≥ 1.1.

## Development

```bash
bun install
bun run test                # every package's tests
bun run check               # biome lint + format
bun run check:reactivity    # the called-signal footgun guard
bun run types:check         # both packages, both of mini-lynx's passes
bun run build               # build both packages
bun run test:dist           # load and drive the built artifacts (needs a build)
```

See [CONTRIBUTING.md](./CONTRIBUTING.md) for the full workflow, and
[`.claude/architecture.md`](./.claude/architecture.md) for how the two packages
relate.

> **Pre-alpha.** Breaking changes can land in any 0.x release; they ride a minor
> bump.

## Related

`@amritk/mini/forms` can validate against a JSON Schema through
[`@amritk/runtime-validators`](https://github.com/amritk/mjst), an optional
peer published from the [mjst](https://github.com/amritk/mjst) repo, where both
packages used to live.

## License

[MIT](./LICENSE)
