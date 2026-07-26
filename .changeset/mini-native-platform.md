---
'@amritk/mini-native': minor
---

Add the platform layer on a new `@amritk/mini-native/platform` subpath, and `Screen` to `/ui`.

`Host` grows **two optional fields and no methods**: `platform`, the name a target calls itself, and `environment`, what it can say about colour scheme, dimensions, and safe-area insets. Fields rather than functions is deliberate — the function count in that contract is the entire porting cost of a new target, and a string that never changes should not be spent against it.

```ts
import { colorScheme, platform, safeArea } from '@amritk/mini-native/platform'

platform.os                                        // 'web' | 'lynx' | 'memory' | 'unknown'
platform.select({ web: 12, native: 16, default: 14 })
```

**Prefer the environment to the OS name**, and the API is arranged to make that the easier path. A name is a proxy for the thing an app actually cares about — is there a notch, does hover exist, is anything addressable — and proxies rot: `os === 'web'` typechecks forever and is wrong the day a second web-shaped target appears. Safe area, viewport, and colour scheme are precisely what a name would otherwise be used to infer. There is deliberately no capability registry yet; designing the flag set before three real branches exist would be guesswork rather than design.

Every environment field is a **signal**, which is what makes the whole thing expressible: a component runs exactly once here, so a plain value would be frozen at the moment the component was built, and the rotation or theme switch afterwards is the entire point. Every field is also optional, and so is the whole object — a host reports what its target genuinely knows and the accessors fill in a documented static value for the rest. The memory host reports nothing at all, which is what keeps those fallbacks exercised on every run rather than only when somebody remembers to check them.

The DOM host wires all three: `matchMedia` for the scheme, a resize listener for the viewport, and — since `env(safe-area-inset-*)` is available to CSS and to nothing else — a throwaway element whose computed padding is read and then removed. Each is built on first read, so an app that never asks registers no listener.

The Lynx host takes its environment as an **argument** rather than reading engine globals. The PAPI subset it drives is element-level, the system-information globals vary by engine version, and there is no fake to exercise them against — so shipping plausible values that are silently wrong on some builds would be worse than asking the app, which knows exactly which engine it is running on.

`Screen` is what the environment earns its keep for: the main content region, with the safe-area insets applied as padding from a getter, so a rotation moves it. Applying insets is the thing every native screen needs and every web page ignores, and it belongs in one component rather than in every app. Pass `edgeToEdge` for the hero image that genuinely should run under the status bar.

Also documented rather than built: whole-component divergence is a bundler concern. `.web.tsx` / `.native.tsx` needs only `resolve.extensions`, and a whole file that is obviously platform-specific is reviewable, greppable, and countable where an inline OS branch in the middle of a component is not.
