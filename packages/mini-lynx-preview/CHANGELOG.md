# @amritk/mini-lynx-preview

## 0.1.0

### Minor Changes

- 8e575fd: Publish the browser preview engine as a package.

  Lynx's Element PAPI implemented over the DOM — `createDomPapi`,
  `installLynxReset`/`LYNX_ROOT_ATTRIBUTE` and `createVisualViewportEmitter` — so a
  `@amritk/mini-lynx` app runs in a browser tab with nothing about it changed. It
  was `apps/playground-mini-lynx/src/lib/` until something outside this repo
  needed the same engine; the playground now boots on the package, so there is one
  implementation rather than two.

  It is the loop with no phone in it — `@amritk/mini-lynx-rsbuild-plugin` is the
  one with a phone, and a scaffolded app carries both.

  Every import of the runtime here is `import type`. A preview that called
  `setEngine` itself would call it on whichever copy of the runtime it resolved,
  which in a consumer's app can be a different copy from the one the app imported
  — and the symptom of that is a blank screen with no error in it. The four lines
  of wiring stay in the app.
