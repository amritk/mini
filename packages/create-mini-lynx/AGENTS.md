# AGENTS.md — @amritk/create-mini-lynx

Contributor guide for AI agents editing **this package**. Repo-wide rules:
[`../../AGENTS.md`](../../AGENTS.md) and [`../../CLAUDE.md`](../../CLAUDE.md).
Consuming the package instead? See [`AI.md`](./AI.md).

`bun create @amritk/mini-lynx my-app` — a template copied to a directory, then
the user's package manager. It is the shortest path from nothing to a running
`@amritk/mini-lynx` app, and the only package here whose product is other
people's files.

## Commands

```bash
bun run --filter='@amritk/create-mini-lynx' test
bun run --filter='@amritk/create-mini-lynx' types:check
bun run --filter='@amritk/create-mini-lynx' build

# the whole thing, by hand, against a scratch directory
bun run --filter='@amritk/create-mini-lynx' build
node packages/create-mini-lynx/dist/cli.js /tmp/scratch-app --no-install
```

## Layout

```
src/
  index.ts        The `.` entry — scaffold and its helpers, for callers that are not a terminal
  scaffold.ts     The filesystem half: copy, rename, name. Prints nothing
  cli.ts          Argument parsing, the install, and every line of output
  template.test.ts  Structural checks on the template a successful copy cannot make
template/
  …               A complete, installable app with both loops wired. Not a fixture — see below
```

## Invariants — do not break these

- **No dependencies, ever.** A scaffolder that installs a tree of its own before
  writing a file is the slowest step in the experience it exists to make fast.
  Argument parsing is hand-rolled for that reason, and the prompt-free design
  follows from it.
- **`scaffold.ts` prints nothing and parses nothing.** Everything needing a
  terminal lives in `cli.ts`. That is what lets the interesting half be tested
  without a subprocess, and what makes `scaffold` usable from another
  generator.
- **A non-empty target directory is refused.** Merging into someone's directory
  destroys work no copy can undo. This is the one behaviour here worth being
  strict about.
- **The template is a real app, not a fixture.** It installs, type-checks and
  builds on its own — *both* builds, `vite build` and `rspeedy build` — with no
  placeholder tokens to substitute; the only edit the scaffolder makes is
  `package.json`'s `name`, through JSON rather than a string replacement. Adding
  a `{{token}}` would put the template one step away from being runnable, and
  the moment it stops being runnable it starts being wrong.
- **Both loops stay wired, and they stay one app.** `dev` is the browser preview
  and `dev:device` is rspeedy, over a single `src/app.tsx`; the entries
  (`src/preview/main.ts`, `src/main-thread.ts`) are the only files that differ
  between the targets. A change that makes one loop work by editing the app for
  it has broken the thing the template is for. `template.test.ts` pins the
  script names, the device entries `lynx.config.ts` names, and the fact that
  nothing outside `src/preview/` mentions a browser global.
- **Everything in `styles.css` has to survive the encoder.** The Lynx template
  encoder drops properties it does not support and warns at build time, where a
  browser simply applies them — `text-transform` was in the first draft of this
  template and is why the CSS carries a comment saying so. Run
  `rspeedy build` after touching that file and read the warnings.
- **`_gitignore` keeps its underscore.** npm renames a published `.gitignore` to
  `.npmignore`, so a template holding the real name ships without one and every
  scaffolded app commits `node_modules`. `RENAMED_ON_WRITE` is the list, and
  `scaffold.test.ts` asserts the rename happened.
- **The template's `@amritk/*` ranges stay `latest`.** Nothing in this repo — not
  changesets, not the release workflow — rewrites a dependency range inside a
  template directory, so a pinned range goes stale silently on the next release
  and a scaffolded app installs a runtime older than its own starter code.
- **The claims in the generated `README.md` are load-bearing.** It says the
  preview is a browser emulating Lynx, lists the four things that emulation is
  blind to, and points at `docs/mini-lynx-explorer.md` for which links in the
  device loop are verified and which are not. If any of that stops being true,
  it is this file and that one that have to change first.
- **`cli.ts` runs `main` only when it IS the command.** `scripts/dist-smoke.test.ts`
  imports every built module to prove it loads; a CLI that scaffolded on import
  would write an app wherever that test ran.

## Tests

`scaffold.test.ts` drives the real template into a temp directory rather than a
fixture — half of what can break here is the template drifting, and a fixture
would keep passing through all of it. `template.test.ts` covers what a
successful copy cannot: that `index.html` points at a file that exists, that the
entry and the HTML agree on `#app`, that the code outside `preview/` names no
browser global, and that the manifest names packages this repo actually
publishes. `cli.test.ts` is the argument grammar.

None of them run the package manager. The install is one `spawnSync` and
mocking it would test the mock.

## Not a playground screen

The repo rule that a new package is not finished until it has a screen in
`apps/playground-mini-lynx` does not reach this one: there is no runtime surface
to demo — the product is a directory of files. The equivalent guard is
`template.test.ts`, plus the fact that the app it writes is the same wiring the
playground itself boots on.
