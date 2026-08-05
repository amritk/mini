# @amritk/mini-helpers

The helpers [`@amritk/mini`](../mini) and [`@amritk/mini-lynx`](../mini-lynx)
both need, factored out so they cannot drift apart.

You do not normally install this yourself — both packages depend on it and
re-export everything in it, so `matchRoute` still comes from
`@amritk/mini/router` and `schemaToValidator` still comes from
`@amritk/mini/forms`. It is published on its own because those packages are
published on their own, and it is documented here because the rule about **what
is allowed in** is worth stating.

## What is in it

| Entry | Exports | Depends on |
|---|---|---|
| `@amritk/mini-helpers` | `matchRoute`, `buildPath`, `PathParams`, `RouteParams`, `parseQuery`, `stripBase` | nothing at all |
| `@amritk/mini-helpers/schema` | `schemaToValidator`, `FormErrors` | `@amritk/runtime-validators` (optional peer) |

```ts
import { buildPath, matchRoute, parseQuery } from '@amritk/mini-helpers'

matchRoute('/users/:id', '/users/42')        // { id: '42' }
matchRoute('/docs/*', '/docs/guide/routing') // { rest: 'guide/routing' }
matchRoute('/users/:id', '/users')           // null

buildPath('/users/:id', { id: '42' })        // '/users/42'

parseQuery('?tab=posts&page=2')              // { tab: 'posts', page: '2' }
```

The pattern is read at the type level too. `PathParams<'/users/:id'>` is
`{ id: string }`, so `matchRoute` hands back exactly the keys the pattern names
and `buildPath` demands exactly the ones it needs — while a pattern known only
as `string` widens back to `RouteParams`, which is what a table built at runtime
gets and what every existing table already got.

## The bar for adding something

`mini` and `mini-lynx` are **siblings, not layers** — neither imports the
other, and that independence is the design. It has one cost, and it has been
paid twice: a defect found in one is usually latent in the other. This package
pays that down for the narrow band of code where sharing costs nothing back, and
the bar is two rules:

1. **No reactivity.** Nothing here imports `alien-signals`, directly or
   transitively. Each package reaches the signal engine through exactly one
   module of its own; a third edge is how a consumer ends up with two signal
   graphs that cannot see each other's writes.
2. **No platform.** No DOM, no Node, no host. The tsconfig withholds both
   ambient libraries, so this is a compiler constraint rather than a convention
   — it is why `parseQuery` is hand-rolled instead of calling `URLSearchParams`,
   which is a web global and not an ECMAScript one.

`src/purity.test.ts` walks the source graph and enforces both, so the charter
cannot erode one convenient import at a time.

## What is deliberately *not* in it

- **The runtime cores.** `signals`, `list`, `mount`, the JSX runtimes and the
  bind helpers are genuinely different code: `@amritk/mini` takes DOM fast paths
  (writing `textContent`, cloning a static template) that have no meaning behind
  a `Host`.
- **`onCleanup` and `runDetached`**, even though they are byte-identical in both
  packages. They live in each package's `.` entry, whose transitive imports must
  be `alien-signals` and nothing else — a shared dependency there would be a
  byte the bundle-size-sensitive widget pays for.
- **`createQuery`**, which is also a verbatim port. It is built out of signals,
  so sharing it would break rule 1.

## Licence

MIT
