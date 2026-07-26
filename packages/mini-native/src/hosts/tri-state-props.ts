/**
 * The props where `false` is a STATEMENT rather than an absence, and the one
 * documented exception to the `setProperty` rule that `false` means "unset it".
 *
 * That rule is right for nearly everything — an attribute is present or it is
 * not — and for these five it erases the very thing the prop exists to express.
 * `aria-expanded="false"` is a collapsed disclosure; no attribute at all is
 * something that does not expand, and announcing the second for the first is a
 * different sentence. `focusable={false}` is a stated opt-out from the focus
 * order, which matters precisely because a `<button>` is focusable without being
 * asked, so dropping the attribute leaves the prop apparently doing nothing.
 * `selectable={false}` says the text may not be copied, on targets whose
 * defaults disagree.
 *
 * So a host distinguishes three cases for these: `true`, `false`, and absent —
 * where only `null` and `undefined` are absent.
 *
 * Shared rather than copied into each host, for the reason
 * `NAMED_EVENTS_WITHOUT_DATA` is: the parity suite found this exact rule applied
 * on one host and missing on the other two, which is the drift a set living in
 * three places invites.
 *
 * Nothing platform-specific may creep into this file: the core type-check pass
 * deliberately runs without the DOM library, and this is shared by the hosts
 * that check under it.
 */
export const TRI_STATE_PROPS = new Set(['focusable', 'selected', 'checked', 'expanded', 'selectable'])

/** Whether a value means "nothing was said", for a prop in {@link TRI_STATE_PROPS}. */
export const isAbsent = (value: unknown): boolean => value === null || value === undefined
