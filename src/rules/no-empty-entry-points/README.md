# import-integrity/no-empty-entry-points

Flags entry point and externally imported files that have no exports.

> AI agents: when fixing a violation of this rule, follow the repo's `import-integrity` skill if one is installed, or consult the [skill published with this plugin](https://github.com/nebrius/import-integrity-lint/blob/main/skills/import-integrity/SKILL.md). It covers the correct fix for each violation and which workarounds to avoid.

## Rule Details

The `entryPointFiles` and `externallyImportedFiles` settings tell Import Integrity which files have exports that are imported by other packages or frameworks. If a file matched by either setting has no exports at all, the configuration is almost certainly wrong. This can happen when a file is modified to remove its exports, or when a file is accidentally added to the list (AI coding agents are particularly prone to adding files that shouldn't be there).

This rule reports any file matched by `entryPointFiles` or `externallyImportedFiles` that has no exports, no barrel reexports, and no single reexports.

## Examples

The examples below assume `entryPointFiles: { '.': './index.ts' }`.

### Incorrect

```js
/*
.
└── index.ts
*/

// index.ts
console.log('I have no exports');
```

### Correct

```js
/*
.
├── index.ts
└── internal.ts
*/

// index.ts
export const foo = 10;
```

```js
/*
.
├── index.ts
└── internal.ts
*/

// internal.ts
export const publicThing = 10;

// index.ts
export { publicThing } from './internal';
```

## Behavior

### Auto-included config files are excluded

Files matching `/*.config.*` are automatically included in `externallyImportedFiles` (see [externallyImportedFiles auto-inference](../../configuration/package-level-options#auto-inference-1)). Since this auto-inclusion cannot be disabled, this rule excludes those files defensively. Config files almost always have exports, but if one didn't, the user would otherwise have no way to silence the resulting error.

## Configuration

### Options

This rule has no options.

### When not to use this rule

We don't recommend disabling this rule. If you have a deliberately empty entry-point file (which is unusual), remove it from `entryPointFiles` or `externallyImportedFiles` rather than disabling the rule.