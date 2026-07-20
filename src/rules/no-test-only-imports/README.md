# import-integrity/no-test-only-imports

Ensures that non-test files' exports are not imported only by test files, unless the export name is prefixed with `_testOnly`.

> AI agents: when fixing a violation of this rule, follow the repo's `import-integrity` skill if one is installed, or consult the [skill published with this plugin](https://github.com/nebrius/import-integrity-lint/blob/main/skills/import-integrity/SKILL.md). It covers the correct fix for each violation and which workarounds to avoid.

## Rule Details

There are two motivations for this rule.

First, it prevents false negatives in dead-code detection. The primary use case for flagging unused exports is to identify code that's no longer in use. But if an export used to be used in production code and a refactor removed the last production usage, a test that still imports the export would mask the dead code from `no-unused-exports`. This rule catches that case.

Second, it nudges tests toward testing public API surfaces rather than internal implementation details. When a test is the only consumer of an export, that's a signal the test is reaching too deep into the implementation. Often it's better to refactor for testability than to reach in.

There are cases where you genuinely need to expose something for tests, such as a test reset helper or an internal-only function whose direct testing improves coverage. For those cases, prefix the export name with `_testOnly`. This rule enforces that `_testOnly`-prefixed exports are only imported by tests, so the marker stays accurate (similar to how `@ts-expect-error` in TypeScript verifies that the suppressed error actually exists, unlike `@ts-ignore`).

Type exports are also exempted, since they can help surface issues in tests and have no runtime cost.

This rule pairs with [`no-test-imports-in-prod`](../no-test-imports-in-prod), which enforces the inverse: that production code doesn't import test files or `_testOnly`-prefixed symbols.

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
export const a = 10;

// __test__/b.ts
import { a } from '../a';
```

`a` is exported from a non-test file but is only imported by a test file. Either prefix the export with `_testOnly` or import it from production code as well.

### Correct

```js
/*
.
├── a.ts
├── b.ts
└── __test__/
    └── c.ts
*/

// a.ts
export const a = 10;

// b.ts
import { a } from './a';

// __test__/c.ts
import { a } from '../a';
```

Imported by both production and test code.

```js
/*
.
├── a.ts
└── __test__/
    └── b.ts
*/

// a.ts
export const _testOnlyA = 10;

// __test__/b.ts
import { _testOnlyA } from '../a';
```

The `_testOnly` prefix marks the export as deliberately test-only.

```js
/*
.
├── a.ts
└── __test__/
    └── b.ts
*/

// a.ts
export interface Foo {
  bar: string
}

// __test__/b.ts
import type { Foo } from '../a';
```

Type exports are exempted.

## Behavior

An export is flagged by this rule if all of the following are true:

1. The export is in a non-test file
2. The export is not a type export
3. The export is not in an [entry-point file](../../configuration/package-level-options#entrypointfiles) or [externally imported file](../../configuration/package-level-options#externallyimportedfiles)
4. The export is imported by at least one file
5. The export is imported only by test files, and the export name is not prefixed with `_testOnly`

A file is considered a test file based on filename and folder conventions (e.g. `.test.`, `.spec`, `__test__`). The full list of patterns, and how to add your own, is on the [`testFilePatterns`](../../configuration/package-level-options#testfilepatterns) page.

## Limitations

### `.d.ts` exports

Exports listed in `.d.ts` files are not checked. This is intentional for the common case where `.d.ts` files declare ambient types for third-party modules. The downside: if a `.d.ts` file declares types for a neighboring `.js` file and exports types not present in the `.js` file, those `.d.ts`-only exports won't be flagged even if they're only imported by tests.

### Barrel imports

If an export is imported as part of a barrel, the rule may report a false negative. The barrel object is referenced, and the rule can't follow the object through arbitrary code to determine which specific exports get accessed:

```js
// a.ts
export const a1 = 10;
export const a2 = 10;

// b.ts
import * as a from './a';
console.log(a.a1);
```

In this example, `a2` may be imported only by tests, but the rule can't determine that.

## Configuration

### Options

This rule has no options.

### When not to use this rule

We don't recommend disabling this rule. If you genuinely need to expose an export for test consumption only, use the `_testOnly` prefix instead of disabling the rule.