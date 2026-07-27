# AGENTS.md — @amritk/mini-helpers

Contributor guide for AI agents editing **this package**. Repo-wide rules:
[`../../AGENTS.md`](../../AGENTS.md) and [`../../CLAUDE.md`](../../CLAUDE.md).
Consuming the package instead? See [`AI.md`](./AI.md).

The helpers `@amritk/mini` and `@amritk/mini-native` both need, factored out so
they cannot drift apart.

## Commands

```bash
bun run --filter='@amritk/mini-helpers' test
bun run --filter='@amritk/mini-helpers' types:check
bun run --filter='@amritk/mini-helpers' build
```

## Layout

```
src/
  index.ts                The `.` entry — zero dependencies, by charter
  match-route.ts          matchRoute + RouteParams — the route pattern grammar
  parse-query.ts          parseQuery — a search string to a flat record
  purity.test.ts          The charter, enforced by walking the source graph
  schema/
    index.ts              The `/schema` entry — the one thing here with a peer
    schema-to-validator.ts  JSON Schema → the (values) => errors both forms take
```

## Invariants — do not break these

- **No reactivity, ever.** Nothing here may import `alien-signals`, directly or
  transitively. Each sibling package reaches the signal engine through exactly
  one module of its own (`src/signals.ts`) so there is a single copy per
  package; a third edge is how a consumer ends up with two signal graphs, where
  an effect created through one never sees a write made through the other. That
  failure typechecks, runs, and simply stops updating.
- **No platform.** No DOM, no Node, no host, no bundler globals. The tsconfig
  withholds `lib.dom` and Node's ambient types, so this is enforced by the
  compiler. It is why `parseQuery` is hand-rolled rather than calling
  `URLSearchParams` — a web platform global, absent from `lib: ["ESNext"]` and
  absent from a native engine. Do not "simplify" it back.
- **The `.` entry has no dependencies at all.** That is the promise it makes,
  and it is why the schema helper sits on `/schema` behind an optional peer
  instead. Anything new with a dependency needs its own entry too.
- **This package is a leaf.** It must never import `@amritk/mini` or
  `@amritk/mini-native` — that would turn two independent siblings into a cycle
  through this one.

`src/purity.test.ts` enforces all four by walking the source graph from both
entries. It is not boilerplate; it is the only thing standing between this
package and becoming a junk drawer.

## What belongs here — and what does not

The bar is high on purpose. `mini` and `mini-native` are **siblings, not
layers**, and that independence is the design rather than an accident (see
[`../../.claude/architecture.md`](../../.claude/architecture.md)). Move code
here only when it is *already* identical in both and clears every invariant
above.

Three things are duplicated on purpose, and none of them should be "fixed":

- **The runtime cores.** `signals`, `list`, `mount`, the JSX runtimes and the
  bind helpers only look parallel. `@amritk/mini` takes DOM fast paths — writing
  `textContent`, cloning a static template — that have no meaning behind a
  `Host`.
- **`onCleanup` and `runDetached`,** which really are byte-identical. They sit
  in each package's `.` entry, whose transitive imports must be `alien-signals`
  and nothing else — both `import-boundary.test.ts` files assert exactly that.
  Sharing them would put bytes in the widget's bundle to save nine lines.
- **`createQuery`,** also a verbatim port, and built out of signals. Rule 1.

## When you change something here

You are changing **both** published packages at once — that is the point of the
file being here, and it is also the risk. Run the full suite, not just this
package's:

```bash
bun run test        # all three packages
bun run test:dist   # needs a prior `bun run build`; packs and installs tarballs
```

The historic failure mode this package exists to prevent runs the other way:
a bug fixed in one sibling and left latent in the other. Both the
scope-ownership bug and the reserved-`key` hole were found that way. For
anything still duplicated, **when you fix a bug in one package, check the other
for the same shape.**
