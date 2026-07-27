---
'@amritk/mini-native': minor
---

Port query from `@amritk/mini` to a new `@amritk/mini-native/query` subpath: `createQuery`, bridging a `@tanstack/query-core` `QueryObserver` to signals.

This one ported **verbatim**, and its being verbatim is the only interesting thing about it. Fetching, caching, deduplication, and retries have no platform in them, and query-core has no opinion about what renders the result — so the whole layer crossed over with no changes beyond its documentation. A screen written against it runs unchanged in a browser preview and on a device.

It is worth the contrast with `/forms`, ported alongside it. A form is also mostly platform-free state, but it eventually has to touch a control, and that one file had to be rewritten. Nothing here touches an element at all, which is why the port is a copy.

The observer is subscribed immediately and unsubscribed through `onCleanup`, so call `createQuery` inside a component or any `effectScope` — the subscription dies with the surrounding scope, exactly like a `bind*` call. Options may be a getter, so a query key can depend on signals and refetch under the new key.

`@tanstack/query-core` is an optional peer: the `.` entry is untouched, and only an app that imports `/query` needs it installed.
