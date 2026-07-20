# import-integrity/no-unused-package-exports

Ensures entry point exports are imported by other packages in a monorepo.

> AI agents: when fixing a violation of this rule, follow the repo's `import-integrity` skill if one is installed, or consult the [skill published with this plugin](https://github.com/nebrius/import-integrity-lint/blob/main/skills/import-integrity/SKILL.md). It covers the correct fix for each violation and which workarounds to avoid.

## Rule Details

`no-unused-package-exports` looks at all exports in [entry point files](../../configuration/package-level-options#entrypointfiles) and analyzes whether any other package in the monorepo imports them. An export is considered used if it is imported by at least one other package.

This is the cross-package counterpart to [`no-unused-exports`](../no-unused-exports). Where `no-unused-exports` checks whether a package's internal exports are imported within the same package, `no-unused-package-exports` checks whether the package's public-API exports are imported by other packages.

The rule only applies to files matched by `entryPointFiles`. Files matched by `externallyImportedFiles` are deliberately not checked, because those represent files imported by a framework runtime (e.g. Next.js `page.tsx`) where Import Integrity cannot see the consumer. `entryPointFiles`, by contrast, represent a package's public API intended for use by other packages in the monorepo, which Import Integrity *can* analyze.

This rule is only meaningful in a monorepo. See [Monorepos](../../guide/monorepos) for more info.

## Examples

### Incorrect

```js
/*
.
└── packages/
    ├── one/
    │   └── entry.ts
    └── two/
        └── index.ts
*/

// packages/one/entry.ts
export const Unused = 1;

// packages/two/index.ts
// (does not import from 'one')
```

### Correct

```js
/*
.
└── packages/
    ├── one/
    │   └── entry.ts
    └── two/
        └── index.ts
*/

// packages/one/entry.ts
export const Used = 1;

// packages/two/index.ts
import { Used } from 'one';
```

## Limitations

### Barrel imports

If an entry point export is imported as part of a barrel, the rule may report a false negative and claim the export is used when it isn't. The barrel object is referenced, and the rule can't follow the object through arbitrary code to determine which specific exports get accessed:

```js
// packages/one/entry.ts
export const a1 = 10;
export const a2 = 10;

// packages/two/index.ts
import * as one from 'one';
console.log(one.a1);
```

In this example, `a2` is not actually used, but the rule can't determine that.

### Non-named barrel reexports

A bare `export * from` in an entry point file has no resolvable name and is skipped by this rule. More importantly, when an entry point uses a bare barrel reexport, Import Integrity cannot track cross-package imports of the reexported names. For example:

```js
// packages/one/entry.ts
export * from 'some-package';

// packages/two/index.ts
import { something } from 'one';
```

The rule won't see the second import. If `packages/two` stops importing `something`, the export won't be flagged as unused.

The [`no-unnamed-entry-point-exports`](../no-unnamed-entry-point-exports) rule mitigates this by requiring entry points to use named barrels (`export * as foo from ...`) or explicit reexports (`export { foo } from ...`) instead of bare ones. For more context on this limitation, see the [barrel-reexport caveat](../../guide/faq#non-named-barrel-export-entry-points-are-not-tracked) in the FAQ.

## Configuration

### Options

#### `ignorePackages`

Type: `string[]`

Default: `[]`

An array of package names to ignore when checking for unused exports. Some monorepos have packages that are published publically, even though most packages are only used internally within the monorepo. When this happens, add the publicly published package names to this array to prevent the rule from flagging exports that are actually used by external consumers.

### When not to use this rule

This rule is only meaningful in a monorepo, so it's not enabled in the default `recommended` configuration. Enable it via `monorepoRecommended`.

If you're in a monorepo but have a deliberately unused entry-point export (e.g. an API surface that external consumers will use but no in-monorepo package consumes), the cleanest fix is to remove the export from the entry point file rather than disabling the rule. If the value needs to remain in the package for some reason, make it a non-exported value, or export it from a non-entry-point file.