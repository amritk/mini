---
'@amritk/mini-lynx': minor
---

Rename the package from `@amritk/mini-native` to `@amritk/mini-lynx`.

"native" was a fossil of the design that got deleted. The package stopped being a multi-platform runtime with a vocabulary of its own and became a signals layer over Lynx — its README's loudest section is now *"It is not a cross-platform layer. Lynx is"* — so the old name contradicted the package's central claim, while also evoking React Native, which is the wrong association entirely.

Naming the pair by target is what makes the architecture legible: `@amritk/mini` renders to the DOM, `@amritk/mini-lynx` renders to Lynx, siblings rather than layers. It also leaves `mini-<target>` free if a third target ever appears, where `mini-native` had squatted on the generic name for one specific engine.

There is no migration to do. The package is version 0.0.0 and has never been published, so there is no deprecation and no alias package — the cost of this rename was only ever going to grow, and this is its floor.

Renamed alongside it: the playground app, the four design notes under `docs/`, and the `jsxImportSource` an app configures, which is now `@amritk/mini-lynx`.
