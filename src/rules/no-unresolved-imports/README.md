# import-integrity/no-unresolved-imports

Ensures that module specifiers in import statements (the `foo` in `import { bar } from 'foo'`) resolve to known modules.

> AI agents: when fixing a violation of this rule, follow the repo's `import-integrity` skill if one is installed, or consult the [skill published with this plugin](https://github.com/nebrius/import-integrity-lint/blob/main/skills/import-integrity/SKILL.md). It covers the correct fix for each violation and which workarounds to avoid.

## Rule Details

TypeScript already catches unresolved imports in `.ts` files, so this rule might seem redundant at first glance. It earns its place in bundler-driven JavaScript projects (and mixed JS/TS codebases) where TypeScript isn't doing this work.

Bundlers do catch unresolved module specifiers (`'nonexistent'` in `import foo from 'nonexistent'`), so those failures surface at build time. What the bundler step doesn't catch are unresolved symbols within resolvable modules. If `./a` exists but doesn't export `nope`, then `import { nope } from './a'` will pass the bundler step and fail at runtime. This rule catches those.

An import is considered resolvable if one of the following is true:

1. **The module specifier matches a Node.js built-in module**, as reported by `builtinModules` in the `node:module` module. The specifier is validated; the symbol (the `bar` in `import { bar } from 'foo'`) is not.
2. **The module specifier resolves to a code file in the package.** Both the specifier and the symbol are validated.
3. **The module specifier is a URL** (e.g. `http://example.com` or `https://example.com`). These are always considered valid.
4. **The module specifier matches a module declared in `package.json`.** The specifier is validated; the symbol is not. See [`package.json` resolution](#package-json-resolution) below for details on how this works in nested directories.

The symbol-level checking in case 2 catches a common class of bugs where a module specifier resolves correctly but the imported name doesn't exist in the target file. For external modules (cases 1 and 3), Import Integrity doesn't have full visibility into the module's exports, so symbol-level checking isn't possible.

## Examples

### Incorrect

```js
/*
.
├── package.json
├── a.ts
└── b.ts
*/

// package.json
{
  "dependencies": {
    "react": "^19.0.0"
  }
}

// a.ts
import { c } from './c';     // ./c.ts doesn't exist
import glob from 'glob';     // 'glob' isn't in package.json

// b.ts
export const b = 10;
```

### Correct

```js
/*
.
├── package.json
├── a.ts
└── b.ts
*/

// package.json
{
  "dependencies": {
    "react": "^19.0.0"
  }
}

// a.ts
import { useState } from 'react';
import { b } from './b';

// b.ts
export const b = 10;
```

## Behavior

### `package.json` resolution

For case 3 in [Rule Details](#rule-details), each `package.json` between the importing file and the root of the repository is consulted (useful in monorepos where the workspace root often has shared dependencies). The walk stops at the first folder containing a `.git` directory, or at the filesystem root if none is found.

## Limitations

### Barrel imports skip symbol-level checking

Barrel imports (`import * as foo from './bar'`) are checked for module-specifier validity but not for symbol-level validity. This is unavoidable given the nature of barrel imports: the entire module is bound to a single namespace, and the rule can't follow downstream access through arbitrary code.

A more subtle case involves barrel imports of barrel reexports:

```js
/*
.
├── a.ts
└── b.ts
*/

// b.ts
export * as path from 'node:path';

// a.ts
import * as path from './b';

console.log(path.joins('a', 'b'));  // path.joins doesn't exist
```

`a.ts` imports the local barrel `b.ts`, which reexports `node:path` as a namespace. Even though `node:path` is a built-in we have visibility into, the level of indirection means this rule can't catch the typo (`joins` instead of `join`).

The [`no-external-barrel-reexports`](../no-external-barrel-reexports) rule prevents barrel reexports of third-party and built-in modules, which mitigates this edge case at its source.

## Configuration

### Options

This rule has no options.

### When not to use this rule

We don't recommend disabling this rule. Unresolved imports are almost always bugs that would otherwise be caught at runtime. Surfacing them at lint time saves debugging cycles.