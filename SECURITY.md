# Security Policy

## Supported versions

mini is pre-alpha (0.x). Only the latest published version of each package is supported. Breaking changes can land in any 0.x release.

## Reporting a vulnerability

Please **do not** open a public issue for security problems.

Report vulnerabilities by opening a [private security advisory](https://github.com/amritk/mini/security/advisories/new) on GitHub. Include:

- The affected package and version
- A description of the issue and its impact
- A minimal reproduction if possible

We aim to acknowledge reports within 7 days and to publish a fix or mitigation as soon as a patch is ready. Coordinated disclosure is appreciated.

## Notes on the attack surface

- `@amritk/mini`'s `bindHtml` is the **only** `innerHTML` sink in either package, and its `sanitize` argument is required at every call site — there is deliberately no default. Every other binding writes through `textContent`, attributes, or `classList`.
- `@amritk/mini-lynx` has no raw-markup sink at all, on any host.
- Report anything that lets bound data reach a markup sink or an event handler it was not meant to, on any target.
