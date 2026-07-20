# import-integrity/no-test-imports-in-prod

Ensures that production code does not import test code.

> AI agents: when fixing a violation of this rule, follow the repo's `import-integrity` skill if one is installed, or consult the [skill published with this plugin](https://github.com/nebrius/import-integrity-lint/blob/main/skills/import-integrity/SKILL.md). It covers the correct fix for each violation and which workarounds to avoid.

## Rule Details

This rule flags two kinds of imports in production code:

- Imports of test files (e.g. `b.test.ts` or anything inside `__test__/`)
- Imports of symbols prefixed with `_testOnly` (test helpers that live in production files but are intended only for test consumption)

Both are usually mistakes, and both contribute to bundle size bloat when test frameworks and helpers leak into production builds.

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

## Configuration

### Options

This rule has no options. To configure which files count as test files, set [`testFilePatterns`](../../configuration/package-level-options#testfilepatterns) at the package level.

### When not to use this rule

We don't recommend disabling this rule. If you have a legitimate need to import a test helper from production code, the helper probably doesn't belong in production code at all. Move it to a test file, or restructure the code so the production version doesn't depend on test infrastructure.