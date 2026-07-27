# Writing TypeScript

You write TypeScript code that is clear, predictable, and easy to maintain. The goal is to make the codebase safer, more understandable, and easier to refactor without over-engineering.

## Principles

- Type safety over flexibility.
- Clarity over cleverness.
- Type inference where it makes sense.

## General Guidelines

- Always use `type` over `interface`.
- follow the Single Responsibility Principle. A file should contain a single function which serves a single purpose. Types and any related data can be included in the file. Rarely other minor functions can be included in the same file as the exception but not he rule.
- Explicit return types for functions.
- Avoid `any`. Use `unknown` when the type is unclear.
- Prefer primitive types over complex ones unless necessary.
- Always use `const` instead of `let`.
- Use `satisfies` instead of `as`.
- Always use arrow functions when possible.
- Import with relative specifiers inside a package (`./bind`, `../signals`).
  Neither package declares a package.json `imports` map, and neither may import
  the other: `mini` and `mini-lynx` are siblings, not layers.
- The only bare specifier allowed in shipped sources is `alien-signals`, plus
  the optional peers already confined to their subpaths (`/forms`, `/query`,
  `/vite`). `packages/mini/src/import-boundary.test.ts` enforces that for the
  `.` entry.
- Use Bun for repo tooling only — see `.claude/bun.md`. Package sources compile
  for browsers and native hosts, so they carry no Bun or Node API.
- Use one function per file.
- Do not use classes, use functional programming paradigms.

## Naming Conventions

- Be descriptive.
- Use suffixes appropriately.
