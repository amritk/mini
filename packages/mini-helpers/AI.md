# AI.md — @amritk/mini-helpers

For an LLM consuming this package. Editing the repo instead? See
[`AGENTS.md`](./AGENTS.md).

## Mental model

Two published UI runtimes — `@amritk/mini` (DOM) and `@amritk/mini-lynx`
(pluggable `Host`) — are the same design re-derived, and neither imports the
other. This package is the small set of helpers that turned out to be
**literally the same code** in both: pure functions over strings and plain
objects, with no reactivity and no platform in them.

## You probably should not import this directly

Both packages re-export everything here from the subpath it belongs to. Prefer
those — they are the documented surface, and they are what the examples use:

```ts
import { buildPath, matchRoute, parseQuery } from '@amritk/mini/router'
import { schemaToValidator } from '@amritk/mini/forms'
// …or the same two lines against '@amritk/mini-lynx/router' / '/forms'
```

Import `@amritk/mini-helpers` directly only when you want the helpers **without**
a UI runtime — matching a route inside a service worker, say.

## The surface, in full

```ts
import { buildPath, matchRoute, parseQuery, stripBase, type PathParams, type RouteParams } from '@amritk/mini-helpers'
import { schemaToValidator, type FormErrors } from '@amritk/mini-helpers/schema'

type RouteParams = Record<string, string>
type PathParams<P extends string>   // '/users/:id' → { id: string }; string → RouteParams
matchRoute<P extends string>(pattern: P, path: string): PathParams<P> | null
buildPath<P extends string>(pattern: P, params: PathParams<P>): string
parseQuery(search: string): RouteParams
stripBase(pathname: string, base: string): string

type FormErrors = Record<string, string>
schemaToValidator(schema: object): (values: Record<string, unknown>) => FormErrors
```

## Gotchas

- **`matchRoute` returns `null`, not `{}`, when nothing matched.** An empty
  object is a *successful* match of a pattern with no params (`/about`), so
  `if (!params)` is the check and `if (!Object.keys(params).length)` is a bug.
- **The params type follows the pattern only while the pattern is a literal.**
  `matchRoute('/users/:id', p)` gives `{ id: string } | null`; assign the
  pattern to a `string` variable first and you get `RouteParams | null`. That
  fallback is deliberate, not a bug — it is what a table read from a manifest
  gets — but it means an annotation in the wrong place silently widens the type.
- **`buildPath` is the inverse and encodes what it fills in,** so it round-trips
  through `matchRoute`. A `*` wildcard is the exception: `rest` is a *path*, so
  its `/` separators stay structural and only the segments between them are
  encoded.
- **A trailing `*` captures into `params.rest`**, always under that name, as the
  raw remainder joined with `/`. It is the empty string when nothing follows.
- **Without a wildcard, the match is exact.** `/users/:id` does not match
  `/users/42/settings` — a longer path is a different, more specific route.
- **Neither function throws on a malformed escape.** `%` alone comes back as
  `%` rather than raising, because a user can type anything into an address bar.
- **`parseQuery` keeps the LAST value when a key repeats** and yields `''` for a
  bare key (`?debug` → `{ debug: '' }`). It decodes `+` as a space.
- **`schemaToValidator` surfaces one error per field**, the first one, because a
  form shows a single message per input. It needs `@amritk/runtime-validators`
  installed — an optional peer, and the only dependency anywhere in the package.
- **Nothing here is reactive.** These are plain functions; call them inside a
  binding (`() => matchRoute(...)`) if you want the result to track a signal.
