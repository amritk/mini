# Security Policy

## Supported versions

niv is pre-alpha (0.x). Only the latest published version of `@amritk/niv` is supported. Breaking changes can land in any 0.x release.

## Reporting a vulnerability

Please **do not** open a public issue for security problems.

Report vulnerabilities by opening a [private security advisory](https://github.com/amritk/niv/security/advisories/new) on GitHub. Include:

- The affected version
- A description of the issue and its impact
- A minimal reproduction if possible

We aim to acknowledge reports within 7 days and to publish a fix or mitigation as soon as a patch is ready. Coordinated disclosure is appreciated.

## Notes on the attack surface

- `bindHtml` is the **only** `innerHTML` sink in the package, and its `sanitize` argument is required at every call site — there is deliberately no default. Every other binding writes through `textContent`, attributes, or `classList`.
- Report anything that lets bound data reach a markup sink or an event handler it was not meant to.
