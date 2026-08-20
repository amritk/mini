---
'@amritk/mini-lynx-native': patch
'@amritk/lynx-deep-linking': patch
---

Fix three ways a call or a URL could quietly mean something other than what it
said.

`resetNativeChannel` no longer restarts correlation ids at 1. A reset rejects
the calls in flight but cannot cancel the native work behind them, so a method
that answered late still sent its reply home under the id it was given — and
that reply landed on whichever fresh call had been filed under the same number,
resolving it with an unrelated call's result. Ids are monotonic across resets
now, so a stale reply matches nothing and is dropped.

The background bridge no longer resolves module or method names off
`Object.prototype`. `NativeModules.constructor` is `Object` and
`NativeModules.toString` is a function, so `isNativeModuleAvailable('constructor')`
answered `true` for a module nobody linked and `callNative` applied whatever it
found instead of reporting "not linked".

`createURL` now encodes `/`, `?` and `#` in the `host` option. Those three
characters end an authority, so a host carrying one produced a different URL
than the caller described — and the `query` the same call asked for landed after
a `?` that was already there. Ports and IPv6 brackets are still left alone.
