---
'@amritk/lynx-secure-storage': patch
---

The Android half no longer leaves a promise unsettled when the store is broken
in the worst way.

Both backstops caught `Exception`, and the failure that matters most here is
not one. A host app that linked the module but shipped without
`androidx.security.crypto` — R8 stripped it, or the dependency was never
declared — raises a `NoClassDefFoundError`, which escaped the executor without
ever invoking the callback. The caller's promise then never settled at all:
not a failed read it could branch on, but a screen waiting forever. Worst on
`isSecureStorageAvailable`, since that is precisely the call an app makes to
find out whether the store works, and the JavaScript `catch` around it cannot
help — a callback that never fires is not a rejection.

Both now catch `Throwable`, so a broken store reports as `keystoreFailure` and
an unavailable one as `false`.
