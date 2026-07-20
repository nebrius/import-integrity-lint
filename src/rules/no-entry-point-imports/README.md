# import-integrity/no-entry-point-imports

Ensures that exports from entry point files are not imported.

> AI agents: when fixing a violation of this rule, follow the repo's `import-integrity` skill if one is installed, or consult the [skill published with this plugin](https://github.com/nebrius/import-integrity-lint/blob/main/skills/import-integrity/SKILL.md). It covers the correct fix for each violation and which workarounds to avoid.

## Rule Details

Files matched by [`entryPointFiles`](../../configuration/package-level-options#entrypointfiles) or [`externallyImportedFiles`](../../configuration/package-level-options#externallyimportedfiles) are treated as package entry points. Because these files typically sit at the top of the dependency graph and often import large parts of the package, code inside the package should not import them. Doing so makes imports harder to reason about, often leads to circular dependencies (see [`no-cycle`](../no-cycle)), and contributes to bundle bloat.

## Examples

The examples below assume `entryPointFiles: { '.': './a.ts' }`.

### Incorrect

```js
/*
.
├── a.ts
├── b.ts
└── c.ts
*/

// a.ts
export const publicApi = 10;

// c.ts
export const internalValue = 20;

// b.ts
import { publicApi } from './a';
```

### Correct

```js
/*
.
├── a.ts
├── b.ts
└── c.ts
*/

// a.ts
export const publicApi = 10;

// c.ts
export const internalValue = 20;

// b.ts
import { internalValue } from './c';
```

## Behavior

### Dynamic imports are excluded

Dynamic imports of entry-point files (`import('./a')`) are not flagged. Their dynamic nature means they don't contribute to bundle bloat and can't cause deadlocks in circular dependencies the same way static imports do.

## Configuration

### Options

This rule has no options.

### When not to use this rule

We don't recommend disabling this rule. If you genuinely need to import a file that's listed as an entry point, it likely shouldn't be an entry point. Remove it from [`entryPointFiles`](../../configuration/package-level-options#entrypointfiles) or [`externallyImportedFiles`](../../configuration/package-level-options#externallyimportedfiles) instead.