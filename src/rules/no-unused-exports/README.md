# import-integrity/no-unused-exports

Ensures exports are imported elsewhere in the package.

> AI agents: when fixing a violation of this rule, follow the repo's `import-integrity` skill if one is installed, or consult the [skill published with this plugin](https://github.com/nebrius/import-integrity-lint/blob/main/skills/import-integrity/SKILL.md). It covers the correct fix for each violation and which workarounds to avoid.

## Rule Details

`no-unused-exports` looks at all exports and analyzes who imports them. An export is considered used if it is [in an entry point file or externally imported file](../../configuration/package-level-options.html#entrypointfiles), or if it is imported by another file in the package.

## Examples

### Incorrect

```js
/*
.
└── a.ts
*/

// a.ts
export const a = 10;
```

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

### Correct

```js
/*
.
└── a.ts
*/

// a.ts
const a = 10;
```

```js
/*
.
├── a.ts
└── b.ts
*/

// a.ts
export const a = 10;

// b.ts
import { a } from './a';
```

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

## Behavior

### Test files don't count as usage

Imports from test files don't count as usage for production exports. If a production file's only consumers are tests, the export is reported as unused. If you want to mark an export as deliberately test-only, use the [`_testOnly` prefix](../no-test-only-imports) instead. `no-test-only-imports` enforces that exports with that prefix are only imported by tests, so the marker stays accurate (similar to how `@ts-expect-error` in TypeScript verifies that the suppressed error actually exists, unlike `@ts-ignore`).

### Type imports count as usage

Exports imported with `import type` (or `export type from`) satisfy this rule even though they're erased at compile time. The third "correct" example above demonstrates this.

## Limitations

### `.d.ts` exports

Exports listed in `.d.ts` files are not checked. This is intentional for the common case where `.d.ts` files declare ambient types for third-party modules. The downside: if a `.d.ts` file declares types for a neighboring `.js` file and exports types not present in the `.js` file, those `.d.ts`-only exports won't be flagged as unused even if they actually are.

### Barrel imports

If an export is later imported as part of a barrel, the rule may report a false negative and claim the export is used when it isn't. The barrel object is referenced, and the rule can't follow the object through arbitrary code to determine which specific exports get accessed:

```js
// a.ts
export const a1 = 10;
export const a2 = 10;

// b.ts
import * as a from './a';
console.log(a.a1);
```

In this example, `a2` is not used, but the rule can't determine that.

## Configuration

### Options

This rule has no options.

### When not to use this rule

We don't recommend disabling this rule. If you have an export that's deliberately not consumed by the current codebase (e.g. a public API that external code will use), declare it in [`entryPointFiles`](../../configuration/package-level-options#entrypointfiles) or [`externallyImportedFiles`](../../configuration/package-level-options#externallyimportedfiles) instead.