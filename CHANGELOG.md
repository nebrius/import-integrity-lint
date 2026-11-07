# CHANGELOG

## 1.4.0 (2026-11-07)

- Fixed `no-test-only-imports` and `no-unused-exports` not counting namespace imports (`import * as`, `import()`) or entry-point barrel re-exports (`export *`, `export * as`) as usage. An export whose production consumers all went through a barrel was wrongly reported as test-only or unused, and so were the re-export statements between them ([#48](https://github.com/nebrius/import-integrity-lint/issues/48)). Usage through a barrel is tracked by name: a re-export inside a namespace exposes only the export it names, and a bare `export *` never forwards a default export
- Fixed `no-unused-exports` reporting re-export statements that imports resolve through: an `export *` that supplies the imported name, a re-export of a builtin or third-party module (`export { join } from 'node:path'`), and a named barrel re-export of one (`export * as path from 'node:path'`) were all reported as unused
- Fixed `no-unresolved-imports` and `no-unused-exports` wrongly reporting an import of a name that a barrel receives through a renamed re-export (`export { a as b } from './impl'`) when another `export *` in the same barrel already points at the same module. The import was reported as unresolved, and its target and the `export *` statements leading to it as unused
- Fixed an import that resolves through a single re-export of a non-code file, such as `export { default as data } from './data.json'`, being reported by both `no-unresolved-imports` and `no-unused-exports`
- Fixed `no-test-only-imports` reporting a type re-export (`export type { X } from`, `export type * from`, `export type * as`) that only tests import. Type exports were already exempt because they have no runtime cost, and type re-exports should have been too
- Fixed an export whose only importer is a test file's namespace import (`import * as`) being reported by `no-unused-exports` as unused instead of by `no-test-only-imports` as test-only; namespace imports were not counted at all
- Fixed `no-test-imports-in-prod` only checking the imported name, which let production code reach a `_testOnly` export without naming it: through `import * as`, `import()`, an import that resolves to an `export * as` namespace, or a renamed re-export. The rule also now reports a re-export in an entry-point or externally imported file (`export *`, `export * as`, or a named re-export chain) that reaches one, since that exposes it to every consumer of the package. A production namespace import of any module carrying a `_testOnly` export is an error. Type-only imports and re-exports are not checked for what they reach, since they expose nothing at runtime
- Fixed `no-unresolved-imports` missing a default import that only reaches a default export through `export *`; `export *` never forwards `default`, so the import fails at runtime
- Fixed `no-cycle` reporting cycles through type-only namespace imports (`import type * as`) and type-only star re-exports (`export type *`, `export type * as`). They are erased at compile time, like the type-only named imports and re-exports that were already ignored
- Fixed `no-unresolved-imports` reporting a type-only namespace import of a package (`import type * as React from 'react'`) as not listed in `package.json` when only its `@types` package is listed, which was already allowed for a type-only named import
- Fixed the `excludeTypeImports` option of `no-restricted-imports` not applying to type-only namespace imports or to type-only re-exports
- Fixed a type-only namespace import or star re-export of a JavaScript file with a `.d.ts` file beside it resolving to the JavaScript file instead of the declaration file, unlike a type-only named import. As with a type-only named import, `no-unused-exports` now reports an export of the JavaScript file that only type-only imports reach
- Fixed `no-unresolved-imports` reporting `import * as` and `export *` as unresolved when the target is a file the plugin does not analyze (gitignored build output, anything in a dot-folder, a file outside `packageRootDir`) or a non-code file such as JSON, and reporting a named import that reaches such a file through a re-export (`import { x } from './barrel'` where the barrel is `export { x } from './generated/client'` or `export * from './generated/client'`). `no-unused-exports` also reported such an `export *` as unused. The plugin only knows the files it analyzes, so it cannot tell a missing file from an ignored one, and TypeScript and bundlers already report a specifier that resolves to nothing, so the module-level check is removed rather than narrowed. The rule's remaining checks are the ones nothing else does: a named import of first party code must land on an existing export, and a third party module must be listed in `package.json`
- Fixed a crash (`Internal error: File … is missing in package info`) when a fixed alias such as `"@plugin": ["./dist/plugin.js"]` points at a file the plugin does not analyze. The import now resolves to nothing, as a relative import of the same file does
- Fixed import statements with an empty module specifier (`import { x } from ''`) or a non-literal dynamic specifier (`import(someVariable)`) being dropped from analysis. In `fix` and `editor` mode, the missing entry left the file's cached analysis misaligned for the rules that ran after it in the same lint pass. Both are now recorded like every other statement, and a non-literal dynamic import cannot be resolved and is not reported by any rule
- Fixed `no-unresolved-imports` not reporting an empty module specifier in an import or re-export (`import { x } from ''`, `export { x } from ''`), which is usually an unfinished edit. It now has a dedicated message
- Fixed cross-file references (an import's resolved export, an export's importers) holding stale source ranges after a whitespace-only edit in `fix` and `editor` mode

## 1.3.1 (2026-10-15)

- Fixed a lint-time slowdown in large monorepos caused by repeatedly re-scanning package root paths on every rule invocation ([#47](https://github.com/nebrius/import-integrity-lint/issues/47))
- Fixed settings being recomputed on every rule invocation in editor mode in monorepos, instead of once after each file watcher update

## 1.3.0 (2026-08-27)

- Added the `defaultIgnoreOverrides` setting for analyzing files and folders that are ignored by default, such as git worktrees in a hidden folder
- Fixed `.gitignore` files above the package root not always being applied
- Improved startup performance in packages containing large hidden folders such as `.git` or `.next`

## 1.2.0 (2026-07-19)

- Added an [agent skill](skills/import-integrity/SKILL.md) that AI can use to fix violations

## 1.1.4 (2026-07-14)

- Fixed a bug where packages without a compile step (e.g. pure JavaScript packages) were not properly being mapped for cross-package import analysis

## 1.1.3 (2026-06-22)

- Fixed a broken link in error reporting

## 1.1.2 (2026-06-03)

- Added support for Windsurf's rebrand to Devin when auto-detecting mode

## 1.1.1 (2026-05-17)

- Added missing Next.js inferred externally imported entries (`/proxy` and `/global-not-found`)

## 1.1.0 (2026-05-17)

- Added `/test/` and `/tests/` to the list of default test patterns
- Improved test pattern matching to handle paths that start with a slash
- Test patterns are now always treated as UNIX file paths, even on Windows, so you don't have to duplicate patterns with slashes in it for both platforms
- `no-unresolved-exports` now treats remote packages (aka module specifiers starting with `http://` or `https://`) as always valid
- Added `ignorePackages` option to `no-unused-package-exports` rule
- Normalized externally imported files merge behavior to match entry point files merge behavior. Technically this is a breaking change, but the package is so new that it's not worth a major version bump.

## 1.0.2 (2026-05-16)

- Follow-up fix for `.d.ts` entry point mapping

## 1.0.1 (2026-05-16)

- Fix: Add support for type-only packages, as indicated by only having a `types` key in `package.json`'s `exports` field
- Fix: `.d.ts` files are no longer being incorrectly flagged as "this file has no compilation, so skip compile mapping step"

## 1.0.0 (2026-05-16)

- Initial release
