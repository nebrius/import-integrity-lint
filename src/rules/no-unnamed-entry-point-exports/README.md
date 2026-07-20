# import-integrity/no-unnamed-entry-point-exports

Ensures that barrel reexports in entry point files are named.

> AI agents: when fixing a violation of this rule, follow the repo's `import-integrity` skill if one is installed, or consult the [skill published with this plugin](https://github.com/nebrius/import-integrity-lint/blob/main/skills/import-integrity/SKILL.md). It covers the correct fix for each violation and which workarounds to avoid.

## Rule Details

This rule flags bare `export * from './x'` in entry point files. Using bare reexports in entry point files has several drawbacks:

- It makes the package's public API harder to reason about, since the set of exported names is not visible at the entry point itself.
- It makes it easy to accidentally leak exports intended to be internal to the package, because every export from the reexported module becomes part of the public API.
- Parts of a barrel export that are not used by other packages are not flagged by [`no-unused-package-exports`](../no-unused-package-exports). This is a fundamental limitation of barrel reexport analysis: when downstream code imports the barrel object, the rule can't determine which underlying symbols are actually used.

Named barrel reexports (`export * as foo from './x'`) and explicit named reexports (`export { foo } from './x'`) are both fine. The fix is straightforward: replace `export * from './x'` with either form.

## Examples

The examples below assume `entryPointFiles: { '.': './index.ts' }`.

### Incorrect

```js
/*
.
├── index.ts
└── internal.ts
*/

// internal.ts
export const publicThing = 10;
export const internalThing = 20;

// index.ts
export * from './internal';
```

The bare reexport exposes both `publicThing` and `internalThing` to consumers of the package, even though `internalThing` was presumably meant to stay internal.

### Correct

```js
/*
.
├── index.ts
└── internal.ts
*/

// internal.ts
export const publicThing = 10;
export const internalThing = 20;

// index.ts
export * as internal from './internal';
```

The named barrel makes it clear that consumers access these symbols via the `internal` namespace.

```js
/*
.
├── index.ts
└── internal.ts
*/

// internal.ts
export const publicThing = 10;
export const internalThing = 20;

// index.ts
export { publicThing } from './internal';
```

The explicit named reexport makes the public API explicit and naturally excludes the internal symbol.

## Configuration

### Options

This rule has no options.

### When not to use this rule

We don't recommend disabling this rule. The fix is mechanical: convert `export *` to either `export * as namespace` or `export { ... }`.