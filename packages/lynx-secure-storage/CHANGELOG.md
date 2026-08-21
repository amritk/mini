# @amritk/lynx-secure-storage

## 0.2.0

### Minor Changes

- 4040e39: Add `@amritk/lynx-secure-storage` — encrypted key-value storage for Lynx.

  The iOS Keychain (`kSecClassGenericPassword`, `ThisDeviceOnly` protection
  classes) and Android's `EncryptedSharedPreferences` over a Keystore-backed
  master key, behind a promise-shaped facade: `getSecureItem`, `setSecureItem`,
  `removeSecureItem`, `hasSecureItem`, `clearSecureStorage` and
  `isSecureStorageAvailable`, plus `createFakeSecureStorage` on `./testing`.

  Values are strings. A write reports failure as a value; every other call throws
  when the store cannot be reached, so `null` from a read keeps meaning "there is
  no such key" and never "the store would not open". Keychain items are cleared on
  first run after a reinstall, an unreadable Android keyset is recovered from
  rather than propagated, and the library contributes its own backup exclusion so
  a host cannot ship a restorable copy of the file by forgetting to.

### Patch Changes

- 7c853e2: The Android half no longer leaves a promise unsettled when the store is broken
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

- Updated dependencies [3c89c54]
  - @amritk/mini-lynx-native@0.2.2
