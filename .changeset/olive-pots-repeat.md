---
'@amritk/lynx-notifications': patch
---

Backport the dangling-selector check from `@amritk/lynx-location`'s parity
suite: `native-contract.test.ts` now asserts that every selector named in the
Objective-C `methodLookup` table has a method implementing it.

That is the one cross-language failure nothing else here could see. A selector
string pointing at no method is not a build error on iOS — `pod lib lint`
passes — and fails only when Lynx tries to dispatch through it, on a device, as
a promise that never settles. All eleven of the package's selectors resolve
today; the check is mutation-verified.

No runtime change.
