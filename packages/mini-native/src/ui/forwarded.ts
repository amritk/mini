import type { ElementProps, ElementTag } from '../elements'

/**
 * The element props a component in this layer passes straight through.
 *
 * Three of the accessibility props are removed, because they are precisely what
 * each component OWNS. A `<Button>` that could be handed `role="heading"` would
 * stop being a button while still being called one, and the entire value of a
 * component layer is that its promise holds at every call site. Where a
 * component genuinely has more than one coherent shape it accepts a narrowed
 * `as` instead — an override that can only pick a role which keeps the promise
 * intact.
 *
 * `children` comes off for a different reason: the components disagree about
 * it. A container tag refuses a bare text run on purpose, and
 * `<Button>Save</Button>` is nevertheless the thing everyone writes, so the
 * components that carry a label widen it and state so themselves.
 *
 * Everything else — `class`, `style`, `show`, `ref`, `testId`, the handlers,
 * `label`, `hint`, `disabled` and the rest of the state props — is forwarded
 * untouched. A component layer that quietly dropped props would be a layer
 * people route around.
 */
export type Forwarded<Tag extends ElementTag> = Omit<ElementProps<Tag>, 'role' | 'level' | 'href' | 'children'>
