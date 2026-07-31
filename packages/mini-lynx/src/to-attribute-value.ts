/**
 * Normalises one attribute value at the last moment before `__SetAttribute`.
 *
 * `text-maxline` is the one attribute accepted as `number | string` even
 * though the shipped types declare `string` — the conflict adjudicated in
 * `vocabulary/intrinsic.ts`, where the docs' code block says `number` and
 * following the types verbatim made `text-maxline={2}` a compile error on
 * about the first real screen anyone writes. A number written there becomes
 * the string the shipped types promise, so the widening in the vocabulary is
 * an authoring convenience that is erased before the engine boundary — the
 * wire carries exactly what `@lynx-js/types` declares, whichever form the
 * author wrote or a getter returned.
 *
 * Everything else passes through untouched. This is not a general coercion
 * channel and must not grow into one; a second adjudicated name earns a set,
 * not a chain of comparisons. Consulting the name is all this function can do,
 * which reaches `markdown`'s `text-maxline` too (typed `number` upstream) —
 * accepted deliberately, so one spelling of an attribute crosses the boundary
 * in one shape rather than a per-tag one this runtime cannot know.
 */
export const toAttributeValue = (name: string, value: unknown): unknown =>
  name === 'text-maxline' && typeof value === 'number' ? String(value) : value
