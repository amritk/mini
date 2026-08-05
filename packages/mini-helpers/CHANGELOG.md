# @amritk/mini-helpers

## 0.2.0

### Minor Changes

- ab6476a: Type route params from the pattern, and give `@amritk/mini-lynx` a browser
  history again.

  **The pattern is now read at the type level.** `PathParams<'/users/:id'>` is
  `{ id: string }`, and `matchRoute` is generic over its pattern, so
  `matchRoute('/users/:id', path)` hands back `{ id: string } | null` instead of a
  record that answers `string` for every key including the misspelt ones. It lives
  in `@amritk/mini-helpers` beside the matcher it mirrors, because the grammar has
  to be one definition or the value and type worlds drift; `path-params.test.ts`
  pins the two together, down to `/v:major` being a literal segment on both sides.

  `PathParams<string>` is `RouteParams`, so this is additive: a table annotated
  `Route[]`, or built at runtime, compiles exactly as before and gets exactly what
  it got before.

  **`buildPath` is the inverse.** `buildPath('/users/:id', { id })` cannot spell
  the pattern wrong, forget a param or be left behind when a route is renamed, and
  its values are encoded to round-trip back through `matchRoute`. A `*` wildcard
  is encoded per segment, because `rest` is a path and its slashes are structure.
  `navigate` still takes a plain string, deliberately — a router navigates to
  concrete paths, and one that matches nothing is what a fallback screen is for —
  so the check sits where the string is assembled instead.

  **`@amritk/mini-lynx/router` gains `route()` and `AnyRoute`.**
  `route('/users/:id', (params) => …, meta)` keeps the pattern's literal type
  alive so the view is handed a `() => { id: string }`. Its three arguments are
  not a style choice: folded into one object literal, the pattern and the metadata
  compete for inference against an intersection, and the metadata loses — a tab
  bar reading `route.label` would get `unknown` back.

  `Route` is now `Route<P extends string = string>`, and the router's generics are
  constrained by the new `AnyRoute`. `Route<'/users/:id'>` is deliberately not
  assignable to `Route<string>` — its `view` demands the narrow getter, and the
  widened form can only promise the flat record — so a table of mixed patterns
  needs a constraint that admits all of them. `render-route.ts` owns the single
  cast that reconciles the two. Existing tables keep working: `Route` with no type
  argument is what it always was.

  **`createBrowserHistory` is back, on `@amritk/mini-lynx/router/browser`.** It is
  a `RouterHistory` and nothing else, because the rest of routing is already
  target-free — a device build swaps `createMemoryHistory()` back in and changes
  nothing else. It takes a `base` prefix, and it stamps its depth into
  `history.state` rather than reading `window.history.length`, which counts the
  whole tab and is wrong in both directions once the user has gone back. That
  stamp is what survives the two things a memory stack never faces: a reload
  mid-stack and a forward button.

  It is the only module in the package that names `window`, and it is quarantined
  accordingly. `src/router/browser/` is excluded from the main compiler pass and
  covered by `tsconfig.dom.json`, so the platform-free rule the rest of the
  package keeps stays something the compiler enforces rather than a convention.
  Hash mode is not included: configuring a host for an SPA fallback is one line,
  where a second URL grammar would be one the device build can never use.

  **`stripBase` moved into `@amritk/mini-helpers`,** since both routers now read a
  browser pathname and a base that meant something slightly different on each side
  is exactly the drift that package exists to prevent. `@amritk/mini`'s router
  surface is unchanged apart from re-exporting `buildPath` and `PathParams`.

## 0.1.0

### Minor Changes

- fd6729c: First release of `@amritk/mini-helpers` — the pure helpers `@amritk/mini` and
  `@amritk/mini-lynx` both need, with no reactivity, no platform and no
  dependencies.

  `matchRoute`/`parseQuery` and `schemaToValidator` were duplicated between the
  two runtimes — `matchRoute` and `schemaToValidator` byte-for-byte — which is
  exactly the drift this repo has paid for before. They now live here, under a
  charter `purity.test.ts` enforces: nothing on the `.` entry carries a
  dependency at all.

  Neither runtime's public surface changes. The three helpers are still exported
  from `@amritk/mini/router`, `@amritk/mini/forms` and their `@amritk/mini-lynx`
  counterparts, so no import in a consuming app moves. This package is a runtime
  dependency of both, so an install picks it up automatically — which is why it
  has to be published rather than kept private.

  One behaviour converges: `@amritk/mini`'s `parseQuery` was built on
  `URLSearchParams`, a web global the native side cannot use, so the hand-rolled
  implementation is the one that survived. It passes every case the old one did
  and additionally tolerates a malformed escape (`?q=100%`) instead of leaning on
  the platform's error handling.

  The byte-budgeted `.` entries of both runtimes are untouched — `onCleanup` and
  `runDetached` stay duplicated on purpose, because a shared dependency there
  would be bytes in the widget's bundle.
