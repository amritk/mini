# AI.md — @amritk/create-mini-lynx

For an LLM consuming this package. Editing the repo instead? See
[`AGENTS.md`](./AGENTS.md).

## Mental model

A scaffolder. It copies a template — a complete, installable
`@amritk/mini-lynx` app — into a new directory, renames the dotfiles npm
mangles, and writes the package name. Then the CLI runs the user's package
manager.

The generated app has **two loops over one `src/app.tsx`**: `bun run dev` serves
it inside a device frame through
[`@amritk/mini-lynx-preview`](../mini-lynx-preview), a browser implementation of
Lynx's Element PAPI; `bun run dev:device` builds a real `.lynx.bundle` through
[`@amritk/mini-lynx-rsbuild-plugin`](../mini-lynx-rsbuild-plugin) and serves it
to Lynx Explorer over a QR code. What differs between the two is the entry, not
the app.

## The command

```sh
bun create @amritk/mini-lynx my-app          # bun
npm create @amritk/mini-lynx@latest my-app   # npm, pnpm, yarn — same package

# flags
--pm <bun|npm|pnpm|yarn>   which package manager installs (default: the one running this)
--no-install               write the files and stop
--start                    boot the dev server when the install finishes (refused with --no-install)
-h, --help / -v, --version
```

The directory argument defaults to `mini-lynx-app`. A non-empty target
directory is refused, not merged into. `--start` runs the *browser* loop
(`dev`); the device loop is `bun run dev:device` in the new project, because it
wants a phone in front of you.

## The surface, in full

```ts
import {
  DEFAULT_NAME,
  scaffold,
  templateDirectory,
  toPackageName,
  type ScaffoldOptions,
  type ScaffoldResult,
} from '@amritk/create-mini-lynx'

type ScaffoldOptions = {
  directory: string             // created if missing; must be empty if it exists
  name?: string                 // package.json name; defaults to toPackageName(basename(directory))
  templateDirectory?: string    // defaults to the template this package ships
}
type ScaffoldResult = { directory: string; name: string; files: string[] }

scaffold(options: ScaffoldOptions): Promise<ScaffoldResult>
templateDirectory(): string     // the shipped template's absolute path
toPackageName(raw: string): string   // a directory name → something npm accepts
DEFAULT_NAME: 'mini-lynx-app'   // the fallback when a name cannot be salvaged
```

`scaffold` is the filesystem half on its own: it parses no arguments, runs no
install and prints nothing, so a generator can drive it directly.

## What the generated app looks like

```
lynx.config.ts            rspeedy: the entry, the QR plugin, pluginMiniLynx
vite.config.ts            the browser preview build
src/app.tsx               the app — both targets build this file
src/styles.css            real CSS; both targets, too
src/main-thread.ts        renderPage(App) — the device's main-thread chunk
src/background.ts         installNativeBridge() — the device's background chunk
src/preview/main.ts       the browser entry: createDomPapi → setEngine → mount
src/preview/frame.css     the phone frame; browser chrome
src/preview/device-switcher.ts  the size picker; browser chrome
```

Scripts: `dev`, `build`, `preview` (browser), `dev:device`, `build:device`
(rspeedy), and `types:check`, which runs both `tsconfig` passes. Dependencies:
`@amritk/mini-lynx` and `@amritk/mini-lynx-native`, plus
`@amritk/mini-lynx-preview`, `@amritk/mini-lynx-rsbuild-plugin`,
`@lynx-js/rspeedy`, `@lynx-js/qrcode-rsbuild-plugin`, `@lynx-js/types`,
`@rsbuild/core`, `typescript` and `vite` for development.

## Gotchas

- **`scaffold` throws on a non-empty directory.** That is deliberate: a
  half-overwrite destroys work a copy cannot undo. Check or empty the directory
  first.
- **The template stores `_gitignore`, not `.gitignore`.** npm renames a
  published `.gitignore` to `.npmignore` inside a tarball, so a template holding
  the real name ships without it. `scaffold` renames it back — if you copy the
  template yourself, you have to as well.
- **The template's `@amritk/*` dependencies are `latest`.** Nothing in this repo
  bumps a range inside a template on release, so a pinned one would go stale
  silently. Pin them yourself after scaffolding if you need a reproducible
  install.
- **The preview is not a device, and not a web target either.** Reach for
  `dev:device` before believing a screen — the four things the preview is blind
  to are exactly the four it cannot warn you about. For a real *web* build, Lynx
  ships `@lynx-js/web-platform`.
- **The DOM libs stop at `src/preview/`.** `tsconfig.json` covers the app and
  the device chunks without them; `tsconfig.preview.json` is the one directory
  that gets them. Moving a `document` out of `preview/` fails the type check,
  which is the point.
- **The scaffolder has no dependencies.** Keep it that way if you extend it —
  an install of its own is the slowest step in the experience it exists to make
  fast.
