# import-integrity/no-test-imports-in-prod

Ensures that production code does not import test code.

> AI agents: when fixing a violation of this rule, follow the repo's `import-integrity` skill if one is installed, or consult the [skill published with this plugin](https://github.com/nebrius/import-integrity-lint/blob/main/skills/import-integrity/SKILL.md). It covers the correct fix for each violation and which workarounds to avoid.

## Rule Details

This rule flags four kinds of statements in production code:

- Imports of test files (e.g. `b.test.ts` or anything inside `__test__/`)
- Imports of symbols prefixed with `_testOnly` (test helpers that live in production files but are intended only for test consumption)
- Imports that reach a `_testOnly` symbol without naming it: a namespace import (`import * as`, `import()`) of a module that has one, a named import that resolves to an `export * as` namespace containing one, or a renamed re-export of one
- Re-exports in an entry-point or externally imported file that reach a `_testOnly` symbol (`export * from`, `export * as ns from`, or a named re-export chain that ends at one), because they expose it to every consumer of the package

All of these are usually mistakes, and all of them contribute to bundle size bloat when test frameworks and helpers leak into production builds.

The last two checks skip type-only statements (`import type * as`, `export type * from`, and so on), since they are erased at compile time and expose nothing at runtime. The first two apply to type-only imports too: importing a test file, or naming a `_testOnly` symbol, is reported either way.

A file is considered a test file based on filename and folder conventions (e.g. `.test.`, `.spec`, `__test__`). The full list of patterns, and how to add your own, is on the [`testFilePatterns`](../../configuration/package-level-options#testfilepatterns) page.

The `_testOnly` prefix is the corresponding mechanism for test helpers that need to live alongside production code. This rule enforces the constraint from the production side; the [`no-test-only-imports`](../no-test-only-imports) rule enforces the matching constraint from the test side, ensuring `_testOnly`-prefixed symbols are only imported by tests.

## Examples

### Incorrect

```js
/*
.
├── a.ts
└── __test__/
    └── b.ts
*/

// a.ts
import { b } from './__test__/b';

// __test__/b.ts
export const b = 10;
```

```js
/*
.
└── a.ts
*/

// a.ts
import { _testOnlyHelper } from './helpers';
```

```js
/*
.
├── a.ts
└── helpers.ts
*/

// a.ts
import * as helpers from './helpers';

// helpers.ts
export const helper = 10;
export const _testOnlyReset = () => {};
```

The namespace object exposes `_testOnlyReset` to production code even though `a.ts` never names it. Import `helper` by name instead.

```js
/*
.
├── index.ts
└── helpers.ts
*/

// index.ts (entryPointFiles: { '.': './index.ts' })
export * from './helpers';

// helpers.ts
export const helper = 10;
export const _testOnlyReset = () => {};
```

`index.ts` is the package's entry point, so its `export *` makes `_testOnlyReset` part of the package's public API. Re-export `helper` by name instead. The same `export *` in a file that is not an entry point is not reported on its own: an import through it is reported at the import site.

### Correct

```js
/*
.
├── a.ts
├── helpers.ts
└── __test__/
    └── a.test.ts
*/

// a.ts
import { helper } from './helpers';
export const a = helper(10);

// __test__/a.test.ts
import { a } from '../a';
```

Test files importing production files is fine. Only the reverse is flagged.

## Limitations

### `_testOnly` exports declared in an entry point

A `_testOnly` export written directly in an entry-point file (`export const _testOnlyReset = ...` in `index.ts`) is not reported. This rule looks at imports and re-exports, and [`no-test-only-imports`](../no-test-only-imports) skips entry points, so nothing checks it. Keep `_testOnly` helpers out of entry-point files.

### Cross-package imports

In a monorepo, imports of another package (`import { x } from '@scope/package'`, `import * as pkg from '@scope/package'`) are not checked against that package's test files or `_testOnly` exports. Cross-package imports are analyzed at the entry-point level only. The re-export check above covers the exporting side: an entry point that exposes a `_testOnly` symbol is reported there.

## Configuration

### Options

This rule has no options. To configure which files count as test files, set [`testFilePatterns`](../../configuration/package-level-options#testfilepatterns) at the package level.

### When not to use this rule

We don't recommend disabling this rule. If you have a legitimate need to import a test helper from production code, the helper probably doesn't belong in production code at all. Move it to a test file, or restructure the code so the production version doesn't depend on test infrastructure.