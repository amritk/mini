# `create-mini-lynx`

One command to a running [`@amritk/mini-lynx`](../mini-lynx) app.

```sh
bun create @amritk/mini-lynx my-app
cd my-app
bun run dev          # the app in a device frame, in a browser tab
bun run dev:device   # rspeedy: two QR codes, and the app on your phone
```

```sh
npm create @amritk/mini-lynx@latest my-app     # or npm, pnpm, yarn
```

The install runs for you, so those three lines are the whole setup. Add
`--start` and the dev server boots too.

## What you get

**Two loops over one source tree.** `dev` serves the app inside a device frame
through [`@amritk/mini-lynx-preview`](../mini-lynx-preview), a browser
implementation of Lynx's Element PAPI — a real app on screen, taking taps, with
no phone and no host application involved. `dev:device` is
[`@amritk/mini-lynx-rsbuild-plugin`](../mini-lynx-rsbuild-plugin) building a
real `.lynx.bundle` and `rspeedy dev` printing the QR codes Lynx Explorer scans.

```
lynx.config.ts          The device build: rspeedy, the QR plugin, pluginMiniLynx
vite.config.ts          The browser preview build
src/
  app.tsx               The app. Both targets build this file, unchanged
  styles.css            Real CSS, because Lynx has real CSS. Both targets, too
  main-thread.ts        The device entry: renderPage(App)
  background.ts         The device's background chunk: the native bridge
  preview/
    main.ts             The browser entry — the only file that knows what a browser is
    frame.css           The phone frame. Browser chrome; never ships
    device-switcher.ts  The size picker above the frame. Also chrome
```

That split is the thing the template exists to teach: the app is target-free,
and what differs between a browser tab and a phone is the entry that boots it.
`tsconfig.json` withholds the DOM libs from everything outside `src/preview/`,
in a second pass (`tsconfig.preview.json`) rather than a comment — so a
`document` in app code fails the type check rather than the device.

## Being straight about which loop to believe

The browser is **emulating Lynx**, so when the two disagree the preview is what
is wrong. It cannot show you a missing `__FlushElementTree`, anything
element-creation-specific, real layout for `linear-weight` and the `relative-*`
family, or the background thread `NativeModules` lives in. The generated
`README.md` says so too, next to what to do about each one — and `dev:device` is
what to do about all four.

What the preview *can* do is the thing that costs a day otherwise: put your app
on screen, in a phone-shaped viewport, with a size picker, before any device is
in the loop.

The device half is honest about its own limits as well:
[`docs/mini-lynx-explorer.md`](../../docs/mini-lynx-explorer.md) records which
links in that chain are verified and which are not. The template is checked
here as far as this repo can check it — both configs type-check, `vite build`
and `rspeedy build` both produce artifacts, and the encoder accepts every
declaration in `styles.css`. What renders on the glass is Explorer's answer to
give.

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
