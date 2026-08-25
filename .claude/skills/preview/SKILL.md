---
name: preview
description: >
  See a mini-lynx change on a real rendered screen: launch the playground-mini-lynx app headlessly and capture
  phone-viewport screenshots an agent can read and show the user. Use this whenever a change to
  packages/mini-lynx, packages/mini-helpers, the lynx-* native modules, or apps/playground-mini-lynx could have a
  visible effect — styling, layout, flow control, lists, events, keyboard, router transitions — and after any such
  change to verify it actually renders, even if nobody asked for a screenshot. Also use it when asked to "run",
  "preview", "screenshot", or "show" the playground or a mini-lynx feature.
---

# Preview — see mini-lynx render

`apps/playground-mini-lynx` renders `@amritk/mini-lynx` in a browser through
`src/lib/dom-papi.ts`, a DOM implementation of Lynx's Element PAPI. That makes
visual feedback cheap: build, serve, screenshot with the bundled script, then
read the PNG. Taps go through the runtime's real worklet dispatch, so
interactions exercise the tested event path, not DOM shortcuts.

## Steps

1. **Build the workspace packages.** The playground imports them from `dist/`,
   so a stale build silently previews old code — when in doubt, rebuild:

   ```bash
   bun install && bun run build
   ```

2. **Start the dev server** in the background and confirm it responds:

   ```bash
   cd apps/playground-mini-lynx && bun run dev --port 5173 --strictPort
   curl -s -o /dev/null -w "%{http_code}" http://localhost:5173/
   ```

3. **Capture.** Write screenshots to a temp directory, never into the repo:

   ```bash
   node .claude/skills/preview/scripts/capture.mjs --out "$TMPDIR/preview.png"
   ```

   Flags: `--url` (default `http://localhost:5173/`), `--out`, `--width`/
   `--height` (default 390×844), and repeatable `--tap "Exact text"` to click
   through screens before capturing. The bottom tab bar navigates by label:
   `--tap Events`, `--tap Flow`, and so on. The script exits non-zero and
   prints any page or console errors, so a broken screen fails loudly instead
   of producing a plausible screenshot.

4. **Look at the PNG** with the Read tool and judge the change. On surfaces
   that can render images to the user (web, desktop, VS Code), send the
   screenshot rather than describing it.

The script launches `/opt/pw-browsers/chromium` when it exists (the
preinstalled browser in Claude Code web containers), otherwise it falls back
to playwright-core's own browser resolution. On a machine where neither
works, point `CHROMIUM_EXECUTABLE` at any Chromium binary.

## What this preview cannot tell you

The browser is emulating Lynx, so where they disagree the preview is what is
wrong — never conclude device correctness from a screenshot alone. Three blind
spots are structural (see `apps/playground-mini-lynx/README.md`):

- `__FlushElementTree` is a no-op here; a mutation that never schedules a
  commit still appears in the preview but would not on a device.
- Per-tag element creation does not exist in a browser; a `view` built the
  generic way looks identical here and degrades on a device.
- Layout is the browser's emulation of Lynx's `linear` display, not the real
  layout engine — treat exact sizes and wrapping as approximate.
