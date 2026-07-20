# import-integrity/no-cycle

Ensures that there are no cycles in imports/reexports.

> AI agents: when fixing a violation of this rule, follow the repo's `import-integrity` skill if one is installed, or consult the [skill published with this plugin](https://github.com/nebrius/import-integrity-lint/blob/main/skills/import-integrity/SKILL.md). It covers the correct fix for each violation and which workarounds to avoid.

## Rule Details

A cycle can occur when file A imports file B, which imports file C, which imports file A. Sometimes this pattern works just fine, but sometimes it can cause severe yet inscrutable bugs. For example, this type of cycle can lead to imports being `undefined` unexpectedly, even if that export is defined as `export const foo = a * 10;` and appears as if it would be impossible to be `undefined`. I've had exactly this bug take down an entire server before.

It's also very difficult to reason about the safety of a given cycle, so it's safer to just prevent all cycles.

## Examples

### Incorrect

```js
/*
.
├── a.ts
├── b.ts
└── c.ts
*/

// a.ts
import { b } from './b';
export const a = 10;

// b.ts
import { c } from './c';
export const b = 10;

// c.ts
import { a } from './a';
export const c = 10;
```

### Correct

The cycle above can be broken by extracting the shared state into a fourth file that the others depend on:

```js
/*
.
├── a.ts
├── b.ts
├── c.ts
└── shared.ts
*/

// shared.ts
export const sharedValue = 10;

// a.ts
import { sharedValue } from './shared';
export const a = sharedValue;

// b.ts
import { sharedValue } from './shared';
export const b = sharedValue;

// c.ts
import { sharedValue } from './shared';
export const c = sharedValue;
```

The right way to break a cycle depends on what each file is actually responsible for. Other common approaches include inverting a dependency, moving an import to be lazy via `import()`, or merging files that don't have meaningfully separate responsibilities.

## Behavior

### Imports considered

Not all imports participate in cycles. This rule considers:

- **Static imports** (`import { x } from './a'`) — included
- **Reexports** (`export { x } from './a'`) — included
- **Barrel imports and reexports** (`import * as a from './a'`, `export * from './a'`) — included
- **Side-effect imports** (`import './a'`) — included. While they don't introduce bindings, they still trigger module evaluation and can cause deadlocks, especially when modules modify `globalThis` or other shared state.

The following are intentionally excluded:

- **Type imports and reexports** (`import type { X } from './a'`, `export type { X } from './a'`) — type-only imports are erased at compile time, so they can't participate in runtime cycles.
- **Dynamic imports** (`import('./a')`) — dynamic imports are always safe in a cycle because they're guaranteed to execute after the importing file finishes loading.

### Self-imports

A file that imports itself is reported as a cycle. This is a stricter behavior than some other tools (Oxlint's built-in `no-cycle`, for example, intentionally excludes self-imports), but in practice self-imports are almost always a bug worth surfacing.

### Algorithm

Cycle detection uses [Tarjan's strongly-connected-components algorithm](https://en.wikipedia.org/wiki/Tarjan%27s_strongly_connected_components_algorithm), implemented iteratively because the import graph in large codebases (e.g. VS Code) is deep enough to overflow the JS call stack with a recursive implementation. SCC membership is an intrinsic property of the import graph, so the same set of cycles is reported regardless of the order in which files are linted.

Each reported cycle includes a path showing the chain of imports. Long paths are truncated in the middle to keep error messages readable:

```
src/a.ts → src/b.ts → src/c.ts → ... 4 more files ... → src/x.ts → src/y.ts → src/a.ts
```

For more on how this rule fits into Import Integrity's overall architecture, see [How it works](../../guide/how-it-works.html).

## Configuration

### When not to use this rule

We don't recommend disabling this rule. Even cycles that appear safe today can become bugs tomorrow, and the cost of refactoring a cycle is almost always lower than the cost of debugging a cycle-induced bug.

### Options

This rule has no options.