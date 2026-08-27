---
'@amritk/create-mini-lynx': minor
---

Add `create-mini-lynx`: one command to a running app, in a browser or on a phone.

`bun create @amritk/mini-lynx my-app` writes a complete `@amritk/mini-lynx`
project, installs it, and leaves you one command from either loop:

- `bun run dev` — the app in a device frame in a browser tab, on
  `@amritk/mini-lynx-preview`, with a size picker and no phone involved.
- `bun run dev:device` — `rspeedy dev` through
  `@amritk/mini-lynx-rsbuild-plugin`: a real `.lynx.bundle`, two QR codes, and
  Lynx Explorer.

One `src/app.tsx` feeds both; what differs is the entry — `src/main-thread.ts`
for the device (plus `src/background.ts`, the chunk `NativeModules` lives in)
and `src/preview/main.ts` for the browser. The DOM libs are withheld from
everything outside `src/preview/`, in a second `tsconfig` pass rather than a
comment, so a `document` in app code fails the type check instead of failing on
the only target that ships.
