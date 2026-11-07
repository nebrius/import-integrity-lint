---
name: import-integrity
description: >
  Use when ESLint or Oxlint reports a violation from an `import-integrity/`
  rule, with messages like "must be imported in another file", "must be
  imported by non-test files", "does not point to a valid first party
  export", "is not listed in package.json", "Imports/reexports cannot form a
  cycle", "Test code should not be imported in production code", "Entry point
  exports should be not imported", or "Default import alias must not have the
  same name as a named export". Explains the correct fix for each rule, which
  obvious fixes are wrong, and when a violation needs a human decision
  instead of a code change.
license: MIT
---

# Fixing import-integrity-lint violations

## How this tool works

import-integrity-lint (rule prefix `import-integrity/`) analyzes the full
import/export graph of a package or monorepo: which exports exist, who imports
them, and whether module boundaries hold. It catches dead exports, broken or
cyclic imports, and boundary leaks that per-file linters can't see. Some files
are declared as the package's public API ("entry points") or as consumed by
external systems like frameworks; their exports are exempt from unused-export
analysis. A violation almost always means the graph analysis is working as
intended — the fix belongs in the code, not in making the report disappear.

## Hard rules

1. Never convert a static import to a dynamic `await import(...)` to silence a
   violation. A dynamic import yields the whole namespace, so it marks every
   export it can reach as used, within a package and across packages alike,
   masking future dead code; and a dynamic import whose specifier is not a
   string literal cannot be analyzed at all. The one place a lazy `import()`
   is a documented fix is no-cycle (see that entry). Otherwise use dynamic
   imports only when runtime lazy/conditional loading is genuinely required.
2. Never add an artificial import whose only purpose is to make an export look
   used. An artificial test import just converts the violation into a
   no-test-only-imports violation, and a production import added to appease
   the linter is itself dead code.
3. Never change the plugin's settings (`entryPointFiles`,
   `externallyImportedFiles`) or rule options (no-unused-package-exports'
   `ignorePackages`), and never disable a rule in config, to resolve a
   violation. Those are human decisions — see the last section.

Also avoid `eslint-disable` comments for these rules: every violation has a
purpose-built resolution below, a disable usually hides real dead code or a
boundary leak, and many repos forbid disabling these rules outright. The one
documented exception: `no-named-as-default` permits a per-line disable when
the colliding name is truly needed. If a disable seems like the only way out
anywhere else, stop and ask (last section).

## Errors and how to fix them

Three messages look nearly identical but need different fixes — match the
whole message, not the prefix: `must be imported in another file`
(no-unused-exports, unused within the package), `must be imported by non-test
files` (no-test-only-imports, used but only by tests), and `Export point
export ... must be imported in another package` (no-unused-package-exports,
entry-point export unused across the monorepo).

### `Export "{{name}}" must be imported in another file` (no-unused-exports)

Nothing in the package imports this export at all — if only tests imported
it, you'd see no-test-only-imports instead. Type-only imports count as usage.
Five causes with different fixes — check `git diff`/`git log` first to see
whether the export or its intended consumer is new, before deleting anything:

- Dead code: remove the `export` keyword, or the whole declaration if nothing
  uses it internally either.
- Work in progress — the importer doesn't exist yet: finish wiring the
  consumer; don't delete the export.
- Intended as a test helper, but no test imports it yet: add the test usage
  and rename it with the `_testOnly` prefix (e.g. `_testOnlyResetCache`),
  which declares a test-only export the rules understand.
- Genuinely public API, or a file a framework consumes: a human decision —
  see the last section.
- `Export "<unnamed>"` on an `export * from` a builtin or npm package, with
  names imported through it: they are used, but the plugin can't see them
  through the `export *`. Re-export the names explicitly, as for
  no-external-barrel-reexports below; don't delete the statement.

### `Import "{{name}}" does not point to a valid first party export` (no-unresolved-imports)

The module resolves but the imported symbol doesn't — a renamed or removed
export, a re-export further down the chain that names an export its target
doesn't have, or a default import of a module that only has `export *` (which
never forwards `default`). Import the symbol that actually exists; if the
export was removed but is still needed, restore it. A module path that is
itself wrong, here or in a re-export along the way, is not reported by this
rule; TypeScript or the bundler will say so.

One exception: a name that reaches a builtin or npm package only through a
bare `export *` (`export * from 'node:path'` in the barrel) is reported even
when the package exports it, because the plugin can't see inside the package.
Don't delete the import or add a stub export. Import the name from the package
directly, or replace the `export *` with explicit re-exports, as for
no-external-barrel-reexports below.

### `Third party module specifier "{{specifier}}" is not listed in package.json.` (no-unresolved-imports)

The importing package's own `package.json` doesn't declare this dependency —
the import only works via hoisting or a transient dependency. Add it to the
correct `package.json` (`dependencies` or `devDependencies`) and install.

### `Module specifier is empty` (no-unresolved-imports)

The statement's module specifier is `''`, usually an unfinished edit. Fill in
the intended module, or delete the statement if it isn't needed.

### `Imports/reexports cannot form a cycle: ...` (no-cycle)

The message shows the cycle path. Break it structurally: extract the shared
code into a new module both sides import, invert one dependency, or merge
files that aren't meaningfully separate. If an edge in the cycle only imports
types, converting it to `import type` is a legitimate fix (type-only imports
are erased at runtime and don't count). Making an edge lazy via `import()`
also genuinely resolves the hazard (dynamic imports run after module loading
completes, so they can't deadlock) and is a documented fix — but prefer the
structural fixes, since a dynamic import marks every export of the target as
used and so masks future dead code there (hard rule 1).

### `Export "{{name}}" must be imported by non-test files` (no-test-only-imports)

A production file exports this, but only tests import it. If production code
should be using it, finish wiring that usage. If it exists only for tests,
rename it with the `_testOnly` prefix (updating the test importers) or move it
into a test utility file. Don't add a token production import (hard rule 2).

### `Test code should not be imported in production code` (no-test-imports-in-prod)

A production file imports from a test file or imports a `_testOnly`-prefixed
symbol. The boundary is one-directional: tests may import production code;
production must never import test code. Move the needed logic out of the test
file into a production module (imported from both sides), or remove the
import.

### `Import exposes test-only export "{{name}}" to production code` (no-test-imports-in-prod)

A production file imports a namespace (`import * as`, `import()`, or a named
import that resolves to an `export * as`) or a renamed re-export that reaches
a `_testOnly`-prefixed export, even though nothing names it. Replace the
namespace import with named imports of the production symbols actually used.
If the namespace is only used in type positions, `import type * as` is also a
fix, since type-only imports are erased and not checked. If the `_testOnly`
export is the only reason the namespace is imported, the import belongs in a
test file.

### `Re-export exposes test-only export "{{name}}" outside the package` (no-test-imports-in-prod)

An entry point (or externally imported file) re-exports something that reaches
a `_testOnly`-prefixed export: `export *` from a module that has one,
`export * as` of such a module, or a named re-export chain that ends at one.
That makes the helper part of the package's public API. For `export *`,
replace it with named re-exports of the production symbols. For `export * as`
or a named chain, move the `_testOnly` helper out of the re-exported module
into a test utility file so the entry point never reaches it. Don't drop the
`_testOnly` prefix to silence this; the helper is still test code.

### `Use alias import ...` / `Use relative import ...` (prefer-alias-imports)

Auto-fixable: run the repo's lint fix command (e.g. `npx eslint --fix <file>`)
or rewrite the specifier exactly as the message says.

### ``Import of Node.js built-in modules must use the `node:` prefix`` (require-node-prefix)

Auto-fixable: run the repo's lint fix command, or add the prefix by hand
(`'fs'` → `'node:fs'`).

### `Default import alias must not have the same name as a named export` (no-named-as-default)

`import foo from './a'` where `./a` also has a named export `foo` — usually
you wanted `import { foo }`. Switch to the named import if so, or rename the
default-import alias. If the colliding name is truly required, this rule's
docs permit a per-line disable comment.

### `Entry point exports should be not imported` (no-entry-point-imports)

Code inside the package imports from the package's own entry point. Import the
symbol from the internal module that defines it instead.

### `Barrel reexports in entry points must be named` (no-unnamed-entry-point-exports)

An entry-point file contains a bare `export * from './x'`, which makes
per-export usage untrackable. Replace it with a named barrel
(`export * as x from './x'`) or explicit reexports (`export { a, b } from
'./x'`).

### `Barrel reexporting builtin or third party modules is not supported` (no-external-barrel-reexports)

`export * from` a builtin or npm package can't be analyzed. Reexport the
specific names instead: `export { join, resolve } from 'node:path'`.

### `Entry point file "..." has no exports` / `Externally imported file "..." has no exports` (no-empty-entry-points)

A file declared as an entry point (or externally imported) exports nothing. If
the file should export something, add the missing exports. If the declaration
itself is stale, fixing it is a settings change — a human decision.

### `Export point export "{{name}}" must be imported in another package` (no-unused-package-exports)

Monorepo-only: an entry-point export isn't imported by any other package. If
it shouldn't be public, stop exporting it from the entry point. If the package
is published or consumed outside the monorepo, exempting it is a settings
decision — stop and ask.

### `Import of Node.js built-in module "{{specifier}}" is not allowed` (no-node-builtins)

This package is configured as a non-Node environment (e.g. browser code).
Remove the built-in usage and use a platform-appropriate alternative.

### Repo-configured messages (no-restricted-imports)

This rule's message text is written by the repo (fallback forms: `<file> is
not allowed to import <specifier>` / `<file> is denied from importing
<specifier>`). The import crosses a boundary the repo deliberately forbids.
Follow the repo's message; get the functionality from an allowed module or
move the code — don't relax the restriction.

## When to stop and ask the human

Stop and report the violation with your reasoning — instead of "fixing" it —
when the correct resolution appears to be any of these maintainer decisions:

- Declaring an export as public API (`entryPointFiles`) or a file as
  framework-consumed (`externallyImportedFiles`).
- Exempting a published package from cross-package analysis
  (no-unused-package-exports' `ignorePackages` option).
- Any other settings or rule-option change, disabling a rule in config, or an
  `eslint-disable` comment not sanctioned above.

Full documentation: https://nebrius.github.io/import-integrity-lint/
Source and rule reference: https://github.com/nebrius/import-integrity-lint#readme
