# import-integrity/no-unresolved-imports

Ensures that imports of first party code point to exports that exist, and that third party module specifiers are listed in `package.json`.

> AI agents: when fixing a violation of this rule, follow the repo's `import-integrity` skill if one is installed, or consult the [skill published with this plugin](https://github.com/nebrius/import-integrity-lint/blob/main/skills/import-integrity/SKILL.md). It covers the correct fix for each violation and which workarounds to avoid.

## Rule Details

TypeScript already catches unresolved imports in `.ts` files, so this rule might seem redundant at first glance. It earns its place in bundler-driven JavaScript projects (and mixed JS/TS codebases) where TypeScript isn't doing this work.

Bundlers do catch unresolved module specifiers (`'nonexistent'` in `import foo from 'nonexistent'`), so those failures surface at build time, and this rule leaves them there (see [Limitations](#missing-modules-are-not-reported)). What the bundler step doesn't catch are unresolved symbols within resolvable modules, and dependencies that only work because of hoisting. If `./a` exists but doesn't export `nope`, then `import { nope } from './a'` will pass the bundler step and fail at runtime. This rule catches those, along with third party modules that aren't declared in `package.json`.

An import is considered resolvable if one of the following is true:

1. **The module specifier matches a Node.js built-in module**, as reported by `builtinModules` in the `node:module` module. The symbol (the `bar` in `import { bar } from 'foo'`) is not validated.
2. **The module specifier resolves to a code file in the package.** The symbol is validated: a named import, or a re-export in an entry point, must land on an export that exists.
3. **The module specifier is a URL** (e.g. `http://example.com` or `https://example.com`). These are always considered valid.
4. **The module specifier matches a module declared in `package.json`.** The specifier must be listed; the symbol is not validated. See [`package.json` resolution](#package-json-resolution) below for details on how this works in nested directories.

The symbol-level checking in case 2 catches a common class of bugs where a module specifier resolves correctly but the imported name doesn't exist in the target file. For external modules (cases 1, 3, and 4), Import Integrity doesn't have full visibility into the module's exports, so symbol-level checking isn't possible.

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
import { nope } from './b';  // b.ts has no export named nope
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

For case 4 in [Rule Details](#rule-details), each `package.json` between the importing file and the root of the repository is consulted (useful in monorepos where the workspace root often has shared dependencies). The walk stops at the first folder containing a `.git` directory, or at the filesystem root if none is found.

### Empty module specifiers

`import { x } from ''` and `export { x } from ''`, usually what an editor leaves behind after auto-closing the quotes, are reported with their own message rather than as an unknown third-party module.

## Limitations

### Missing modules are not reported

A relative or aliased specifier that resolves to no file at all, such as `import { x } from './missing'` or `export * from './missing'`, is not reported by this rule in any form of statement. TypeScript and every bundler already report it. Beyond that, the plugin only knows the files it analyzes, so a file that is ignored (build output under `dist/`, a dot-folder, anything matched by `.gitignore`) or that lies outside [`packageRootDir`](../../configuration/repo-level-options#packagerootdir) looks the same as one that doesn't exist, and reporting it would flag imports of generated code that work fine. The statement is still recorded. A named import that resolves *through* such a statement is not reported either, since whether the name exists there is just as unknowable: `import { x } from './barrel'` where the barrel is `export { x } from './generated/client'` or `export * from './generated/client'`. The same goes for an `export *` of a non-code file the plugin doesn't parse, such as `export * from './queries.graphql'`. A name that a file the plugin can see does supply still resolves to that file.

### Names imported through an `export *` of an external module are reported

```js
// a.ts
export * from 'node:path';

// b.ts
import { join } from './a';  // reported, even though node:path exports join
```

The plugin doesn't know what a third-party or built-in module exports, so a name that can only come through a bare `export *` of one has nothing to resolve to, and it is reported whether or not the module exports it. [`no-unused-exports`](../no-unused-exports) also reports the `export *` as unused unless something imports `a.ts` as a namespace, and [`no-external-barrel-reexports`](../no-external-barrel-reexports), which is in the recommended config, reports the `export *` itself. Import the name from the module directly, or re-export it by name (`export { join } from 'node:path'`), which resolves.

This is the opposite of a bare `export *` of a first party file the plugin can't see, described above, which is trusted to supply the name: that shape is common for generated code, while `no-external-barrel-reexports` rejects this one.

### Dynamic imports with non-literal specifiers are not checked

`import(someVariable)` or `` import(`./locales/${lang}`) `` has no specifier to check against `package.json`. The statement is recorded like any other import, but this rule does not report it.

### Barrel imports skip symbol-level checking

Barrel imports (`import * as foo from './bar'`) have no symbol to check. This is unavoidable given the nature of barrel imports: the entire module is bound to a single namespace, and the rule can't follow downstream access through arbitrary code.

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