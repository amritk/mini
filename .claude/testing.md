# Writing Tests

You write tests that are clear, maintainable, and thorough. You optimize for readability and reliability. Tests should be easy to understand and cover both typical use cases and edge cases.

## Setup

- Use Vitest for most tests. Vitest is our primary testing framework.
- No globals. Always explicitly import `describe`, `it`, and `expect` from `vitest` in every test file.
- File naming conventions:
  - Unit/integration test files end with `.test.ts`.
  - Each test file matches the name of the file it tests. Example: If the code is in `custom-function.ts`, the test file should be named `custom-function.test.ts`.
  - The test file is located in the same folder as the file under test. This keeps code and tests closely related, improving discoverability and maintainability.
- Minimize mocking. Only mock when absolutely necessary. Prefer refactoring the code under test to make mocking unnecessary. Aim for simpler, pure functions that are easier to test without mocks.
- Do not use stubs.
- Every test file has a single top-level `describe()`.
- The top-level `describe()` matches the file name under test. Example: `describe('custom-function')` for `custom-function.test.ts`.
- Do not use nested `describe()` blocks. Keep tests flat within the single `describe()`.
- Use `it()` for individual tests.
- Keep test descriptions concise and direct.
- Do not start test descriptions with "should."
  - ✅ `it('generates a slug from the title')`
  - ❌ `it('should generate a slug from the title')`

## How tests run in this repo

- **Everything runs from the repo root.** Each package's `test` script is
  `NODE_ENV=production vitest run --root ../.. packages/<name>/`, so every suite
  picks up the `src` aliases in `vitest.config.ts` — `@amritk/mini` and
  `@amritk/mini-native` (and their `jsx-runtime` subpaths) resolve to source,
  never to `dist`. Run a single package with
  `bun run --filter='@amritk/mini' test`.
- **`@amritk/runtime-validators` is deliberately not aliased.** It is an
  optional peer published from another repo, so it resolves out of
  `node_modules` exactly as a consumer's would.
- **DOM tests opt in per file** with a `// @vitest-environment happy-dom` pragma
  on line 1 — there is no global environment. `mini`'s suites use it freely
  because it renders real DOM. `mini-native` is the opposite: it is supposed to
  be platform-free, so a suite that silently got a `document` would hide a real
  platform dependency. Test that package through the memory host
  (`createMemoryHost` + `serializeMemoryTree`); `create-dom-host.test.tsx` is
  the one file there that legitimately needs the pragma.
- **`scripts/*.test.ts` are a separate suite.** They run under
  `vitest.dist.config.ts` (`bun run test:dist`) with no aliases at all, because
  their whole purpose is to exercise the compiled `dist/` and the packed
  tarballs the way npm ships them. They need a prior `bun run build`, and they
  shell out to plain `node` rather than Bun.
- **Some tests guard structure, not behaviour** — `core-size-budget.test.ts`
  holds the byte ceiling on the `.` entry, `import-boundary.test.ts` holds its
  import graph, and the invariant regression tests named in each package's
  `AGENTS.md` pin gotchas that have bitten before. When one of these fails,
  the change is what is wrong, not the test. Do not raise the budget or
  loosen the boundary to make it pass.
- **`bun run check:reactivity`** is a lint-shaped gate, not a Vitest suite: it
  scans `.tsx` for `attr={signal()}`, which freezes a value where `attr={signal}`
  would stay reactive. A test that freezes a signal on purpose needs the
  documented opt-out in `packages/mini/AGENTS.md`.

## Style & Best Practices

- Clarity first. Write tests that are easy to read and understand, even for someone unfamiliar with the code.
- Think like a QA engineer.
- Cover all important code paths.
- Test both the happy path and error handling.
- Add tests for edge cases and potential failure scenarios.
- Comments are welcome when they add value.
- Use comments to explain why a test exists, not what it is doing.
- Avoid repeating what the code already makes obvious.

## Example Test File Structure

```
/src
  /lib
    custom-lib.ts
    custom-lib.test.ts
```

```typescript
import { describe, expect, it } from "vitest";
import { doSomething, generateSlug } from "./custom-lib";

describe("custom-lib", () => {
  it("generates a slug from the title", () => {
    const result = generateSlug("Hello World");
    expect(result).toBe("hello-world");
  });

  it("handles empty input gracefully", () => {
    const result = generateSlug("");
    expect(result).toBe("");
  });

  it("does something really well", () => {
    const result = doSomething("Hello World");
    expect(result).toBe("hello-world");
  });
});
```
