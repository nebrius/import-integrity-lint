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
   violation. Within a package, dynamic imports don't count as usage at all,
   so the conversion can create new unused-export violations; across packages
   in a monorepo, a dynamic import marks every export of the target file as
   used, masking future dead code. The one place a lazy `import()` is a
   documented fix is no-cycle (see that entry). Otherwise use dynamic imports
   only when runtime lazy/conditional loading is genuinely required.
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
Four causes with different fixes — check `git diff`/`git log` first to see
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

### `Import "{{name}}" does not point to a valid first party export` (no-unresolved-imports)

The module path or the imported symbol doesn't resolve — a typo, a moved or
deleted file, or a renamed/removed export. Fix the specifier or import the
symbol that actually exists; if the export was removed but is still needed,
restore it.

### `Third party module specifier "{{specifier}}" is not listed in package.json.` (no-unresolved-imports)

The importing package's own `package.json` doesn't declare this dependency —
the import only works via hoisting or a transient dependency. Add it to the
correct `package.json` (`dependencies` or `devDependencies`) and install.

### `Imports/reexports cannot form a cycle: ...` (no-cycle)

The message shows the cycle path. Break it structurally: extract the shared
code into a new module both sides import, invert one dependency, or merge
files that aren't meaningfully separate. If an edge in the cycle only imports
types, converting it to `import type` is a legitimate fix (type-only imports
are erased at runtime and don't count). Making an edge lazy via `import()`
also genuinely resolves the hazard (dynamic imports run after module loading
completes, so they can't deadlock) and is a documented fix — but prefer the
structural fixes, since a dynamic import no longer counts as usage of the
target's exports (hard rule 1).

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
