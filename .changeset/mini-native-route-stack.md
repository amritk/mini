---
'@amritk/mini-native': minor
---

Add `RouteStack` — the navigation stack — to `@amritk/mini-native/router`, alongside the `RouteView` single slot it has always had.

The stack is the router's **depth** made visible, and that is what it was waiting on as much as the animation seam. `RouteView` reads the matched route, which is all a browser page needs. A stack has to know whether a location arrived by being pushed on top of the last one or by replacing it — `/users/1` → `/users/2` is two screens when it was pushed and one when it was replaced, and the matched route is identical either way. So `Router` now exposes `depth` as a signal, the count that was already behind `canGoBack`.

```tsx
<RouteStack router={router} transition={fadeTransition()} fallback={() => <NotFound />} />
```

Every screen beneath the top one stays built, which is the point rather than a cost to optimise away: a scroll position, a half-filled form, and an in-flight request are all still there on the way back, and rebuilding on pop would throw away exactly what a back gesture promises. They are hidden through `Host.setVisible`, so a buried screen leaves the tab order and the accessibility tree rather than being painted over — which is also how several screens can each be a `Screen` (a `<main>` on the web) without the page claiming to have more than one. It follows that a stack fifty screens deep holds fifty screens, the same trade every native stack navigator makes.

Cards are absolutely positioned inside the container, and that is **the one layout opinion in the package**. Two screens have to overlap for any transition between them to mean anything; in normal flow they would sit head to tail and a cross-fade would fade between two things that are not in the same place. It is structural rather than taste, and it is the shape every stack navigator on every platform arrives at. A transition moves the card rather than the screen inside it, so it can never collide with a `style` the app bound — and the container has to be a real element, because `createFlowHost`'s wrapper is `display: contents` on the web, which is precisely the thing that cannot be a positioning context.

`transition` is a seam and defaults to none — the same path a host with no `animate` and a user who asked for reduced motion already take, and the settled tree is identical either way, which is the rule the whole animation seam rests on. `fadeTransition` is the only one shipped: opacity means the same thing on every target, while a slide's distance is the viewport's width and its direction depends on the writing mode, so the seam hands over both cards and the direction and lets an app write one.

Two fixes fell out of building it, both invisible in a single slot and both plainly visible in a stack:

- **`createBrowserHistory` now stamps its depth onto each history entry** instead of subtracting one per `popstate`. Counting steps is right for a back, backwards for a **forward** — the button puts the app deeper and the count said shallower — and wrong by several for a jump through the history list. The stamp is namespaced and merged into whatever state the page already stored.
- **`createRouter` announces a navigation once.** `route` and `depth` are written in one batch, because separately anything reading both would see a state that never existed — the new location at the old depth, which reads as a redirect onto the route that was about to be pushed. And a refresh that finds nothing changed now returns without writing: `back()` reaches it twice for one navigation (an in-memory history notifies, because a hardware gesture calls it from outside; the router refreshes after calling it, because a browser answers asynchronously), and the second pass used to re-announce a location the app was already at, restarting whatever the first one started.
