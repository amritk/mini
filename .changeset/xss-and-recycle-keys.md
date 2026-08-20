---
'@amritk/mini': patch
'@amritk/mini-lynx': patch
---

Close an inline-handler injection in the JSX runtime, and say something when a
recycling list's keys collide.

`@amritk/mini` no longer writes an `on…` prop through as an attribute when its
value is not a function. `setAttribute('onclick', someString)` installs an
inline handler — script the browser compiles and runs — and the ordinary way a
string got there was a `{...props}` spread carrying data nobody audited. That
was markup injection on a path `grep bindHtml` does not find, which is the grep
this package's whole XSS story rests on. The name is tested against the element,
so a custom attribute that merely starts with those two letters (`once`,
`online`) is untouched, and a function-valued handler still binds through
`addEventListener` exactly as before.

`@amritk/mini-lynx`'s `recycle` now warns when two rows share an `itemKey`. The
inventory diff is keyed, so a repeat made it describe a list nobody has: the map
keeps only the last index for a duplicated key, and every earlier row then
reports as having moved from it — on an update that changed nothing. Both
`list()` implementations already warn on a key collision; this is the same
mistake with a symptom much harder to trace back.
