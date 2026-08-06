---
'@amritk/lynx-secure-storage': minor
---

Add `@amritk/lynx-secure-storage` — encrypted key-value storage for Lynx.

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
