---
"@amritk/mini-lynx-native": patch
---

Republish the bridge with the `dist/` its manifest has always promised, and
remove the `development` export condition that hid the miss.

`@amritk/mini-lynx-native@0.2.0` went to npm as a src-only tarball. It was
published by hand rather than through the release workflow, so none of the
things that workflow does before `changeset publish` ever ran: no `bun run
build`, so there was no `dist/`; no `strip-development-exports`, so the
`development` condition survived; no `copy-license`, so the tarball carried no
LICENSE. The manifest still declared `./dist/index.js`, `./dist/background/index.js`
and `./dist/testing/index.js`, and `files` still listed `dist` — every one of
those pointed at nothing.

The surviving condition is why this was survivable rather than fatal, and why it
went unnoticed for a release: it resolved to `./src/*.ts`, and `src` does ship,
so anything honouring it got raw TypeScript and appeared to work. Anything that
did not — plain Node, a bundler on default conditions, `tsc` reading `types` —
got a resolution failure against a package whose exports named files that were
not in the tarball.

0.2.1 is the same code, published through the release workflow, so it carries
`dist/` and its type declarations. Consumers working around the miss by forcing
the `development` condition — a `customConditions` entry in `tsconfig.json`, a
resolve condition in the bundler config, a `--conditions development` flag on
the test command — can drop all three and resolve normally.

The four `@amritk/lynx-*` packages pin the bridge at an exact version, so their
0.2.0 releases still point at the broken tarball; they go out alongside this one
re-pinned to 0.2.1.

**The condition is gone from every package.** It existed so the workspace could
resolve its own packages to source without a build, but it lived in the one
place that ships — the `exports` map — which is what let it reach a tarball at
all. Nothing strips it at publish time now because nothing declares it: the
packages resolve each other through `types`/`import` like any consumer, and the
build simply runs before the type check. Tests are unaffected, having always
used `vitest.config.ts`'s `src` aliases rather than the condition. The
playgrounds and the bundle-size bench keep resolving to source through
repo-local mechanisms that cannot ship.

Publishing out of band can no longer do this quietly. Every publishable package
runs `scripts/check-publishable.mjs` as `prepublishOnly`, which fails the
publish when an exports map points at a `dist/` file that is not on disk, when a
`development` condition is present at all, or when the package directory has no
LICENSE.
