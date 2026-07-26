/**
 * The events the vocabulary names, and therefore the ones a host owes a
 * normalised payload for.
 *
 * Shared by the hosts rather than copied into each, because three sets that
 * must agree are three sets that can drift — and the drift would be silent, in
 * the shape of one target handing a handler the raw platform event while the
 * others hand it the framework's. See `Host.addEventListener`.
 *
 * The entries that carry data (`tap`, `longpress`, `scroll`, `input`, `change`)
 * are reshaped individually by each host, since only the host knows where its
 * target keeps a coordinate. The four here carry nothing portable beyond the
 * raw event, so naming them is all that is needed: they still get an object
 * with a `raw`, which is what tells a handler it is holding a framework payload
 * rather than a platform one.
 *
 * Nothing platform-specific may creep into this file: the core type-check pass
 * deliberately runs without the DOM library, and this is shared by the hosts
 * that check under it.
 */
export const NAMED_EVENTS_WITHOUT_DATA = new Set(['focus', 'blur', 'load', 'error'])
