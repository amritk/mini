---
'@amritk/create-mini-lynx': minor
---

Add `create-mini-lynx`: one command to a running app.

`bun create @amritk/mini-lynx my-app` writes a complete `@amritk/mini-lynx`
project, installs it, and leaves you one `bun run dev` from the app on screen in
a device frame — running on `@amritk/mini-lynx-preview`, with a size picker, and
with the app half (`src/app.tsx`, `src/styles.css`, `src/device.ts`) kept apart
from the browser half (`src/preview/`) so the split is visible from the first
file you open.

It builds no Lynx bundle and does not claim to: a physical device needs a Lynx
host application and a template-format bundler, neither of which ships here. The
generated README says that in those words, along with the four things a browser
cannot show you about a device.
