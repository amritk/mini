# `create-mini-lynx`

One command to a running [`@amritk/mini-lynx`](../mini-lynx) app.

```sh
bun create @amritk/mini-lynx my-app
cd my-app
bun run dev
```

```sh
npm create @amritk/mini-lynx@latest my-app     # or npm, pnpm, yarn
```

The install runs for you, so those three lines are the whole setup. Add
`--start` and the dev server boots too.

## What you get

A Vite project whose `dev` script serves the app inside a **device frame**,
running on a browser implementation of Lynx's Element PAPI
([`@amritk/mini-lynx-preview`](../mini-lynx-preview)) — so there is a real app
on screen, reacting to taps, before any device or host application is involved.

```
src/
  app.tsx               The app. Every line of it runs unchanged on a device
  styles.css            Real CSS, because Lynx has real CSS. Ships to a device
  device.ts             The device entry: renderPage(App), and nothing else
  preview/
    main.ts             The browser entry — the only file that knows what a browser is
    frame.css           The phone frame. Browser chrome; never ships
    device-switcher.ts  The size picker above the frame. Also chrome
```

That split is the thing the template exists to teach. Everything outside
`preview/` is the app; everything inside it is a stand-in for a device.

## Being straight about the preview

The browser is **emulating Lynx**, so when the two disagree the preview is what
is wrong. It cannot show you a missing `__FlushElementTree`, anything
element-creation-specific, real layout for `linear-weight` and the `relative-*`
family, or the background thread `NativeModules` lives in. The generated
`README.md` says so too, next to what to do about each one.

What it *can* do is the thing that costs a day otherwise: put your app on screen,
in a phone-shaped viewport, with a size picker, in one command.

**It does not build a Lynx bundle.** Getting onto a physical device needs a Lynx
host application — a [Sparkling](https://github.com/tiktok/Sparkling)- or
LynxExplorer-style shell — and a bundler that emits Lynx's template format.
Neither ships here, and a starter that pretended otherwise would be lying about
the one thing you cannot check from a browser tab. `src/device.ts` is the
two-line entry a device build uses when you have one.

## Options

```
bun create @amritk/mini-lynx <directory> [options]

  --pm <bun|npm|pnpm|yarn>  Which package manager installs (default: the one running this)
  --no-install              Write the files and stop
  --start                   Boot the dev server when the install finishes
  -h, --help                Show this
  -v, --version             Print the version
```

The directory defaults to `mini-lynx-app`, and its name becomes the package's —
run through npm's naming rules, so `My App` is fine. A directory that already
has something in it is refused rather than merged into.

## From a script

```ts
import { scaffold } from '@amritk/create-mini-lynx'

const { directory, name, files } = await scaffold({ directory: './my-app' })
```

`scaffold` does the filesystem half and nothing else — no argument parsing, no
install, no output — so a generator of your own can drive it directly.

`AI.md` next to this file is the version written for a coding agent.
