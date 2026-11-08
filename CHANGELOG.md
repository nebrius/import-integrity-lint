# CHANGELOG

## 2.0.0 (2026-11-07)

### Breaking changes

- Rules report cases that 1.x missed, and many projects will see new errors after upgrading. Each comes from a false negative fixed below:
  - `no-test-imports-in-prod`: a production import that reaches a `_testOnly` export without naming it (`import * as`, `import()`, an import of an `export * as` namespace, or an import through a renamed re-export), and an entry-point or externally imported re-export that reaches one. Type-only statements are exempt
  - `no-unresolved-imports`: a default import that only reaches a default export through `export *`, which never forwards `default`; an empty module specifier, with its own message; a dependency listed only in a sibling directory's `package.json`; and an import through an alias into a sibling of the package or of `rootDir`, which is now treated as third party and reported as not listed in `package.json`
  - `no-unused-exports`: a default export whose only importer was a default import through `export *`, which never reached it, and an export of a JavaScript file reached only by type-only imports, which now resolve to the `.d.ts` beside it
  - `no-test-only-imports`: an export whose only importer is a test file's `import * as`
- Node.js 22.12 or later is required, declared in `"engines": { "node": ">=22.12.0" }`. 1.x also needed Node.js 22, but didn't say so, and failed on the first file it linted on Node.js 20
- The data `getESMInfo` returns to custom rules changed, following the fixes below:
  - When `rootModuleType` is `firstPartyOther`, `rootModulePath` can now be `undefined`, for an import whose re-export chain ends at a file the plugin doesn't analyze
  - `importedBy` and `barrelImportedBy` were missing entries reached through barrels and re-exports, and listed some a namespace can't reach. An export or re-export now lists every import that reaches it by name in `importedBy`, and every import or entry-point re-export whose namespace contains it in `barrelImportedBy`, including the re-export statements along the way. A bare `export *` never contributes `default`, and a re-export inside a namespace contributes only the export it names
  - Every import and export statement has an entry, including imports with an empty specifier and dynamic imports with a non-literal one, whose `moduleSpecifier` is `undefined`. A side-effect import's `moduleSpecifier` is now always a string
  - Barrel imports carry `isTypeImport` and barrel re-exports carry `isTypeReexport`. A type-only namespace import or star re-export of a JavaScript file with a `.d.ts` beside it resolves to the `.d.ts`
  - A fixed alias to a file the plugin doesn't analyze resolves to `firstPartyOther` with no path instead of `firstPartyCode`, and an alias into a sibling of the package or of tsconfig's `rootDir` whose name starts the same way is dropped, so imports through it are `thirdParty`

### Fixes

- Fixed `no-unused-exports` and `no-test-only-imports` miscounting usage through barrels and re-exports ([#48](https://github.com/nebrius/import-integrity-lint/issues/48)). Namespace imports (`import * as`, `import()`) and entry-point barrel re-exports (`export *`, `export * as`) weren't counted, and re-export statements often weren't recorded as used, so exports used only through them, and the re-exports in between, were reported as unused or test-only. Usage is now tracked by name through every kind of re-export, including renamed ones and ones that point at builtin, third party, or non-code modules. A re-export inside a namespace exposes only the export it names, and a bare `export *` never forwards `default`
- Fixed type-only imports and re-exports being treated as runtime code by some rules. Type-only namespace imports and star re-exports (`import type * as`, `export type *`, `export type * as`) now count as type-only everywhere a type-only named import already did: `no-cycle` ignores them, `no-unresolved-imports` accepts a package listed only as `@types/...`, and they resolve to a `.d.ts` file beside a JavaScript file. Every type-only re-export, `export type { X } from` included, is now exempt in `no-test-only-imports` as type exports already were, and is covered by `excludeTypeImports` in `no-restricted-imports`
- Fixed `no-unresolved-imports` reporting modules the plugin can't see, such as gitignored build output, dot-folders, files outside `packageRootDir`, and non-code files, including through a re-export (`export { x } from './generated/client'`, `export * from './generated/client'`). The plugin can't tell an ignored file from a missing one, and TypeScript and bundlers already report a specifier that resolves to nothing, so the rule now checks only what nothing else does: that a named import of first party code lands on an existing export, and that a third party module is listed in `package.json`
- Fixed three crashes: `Internal error: File … is missing in package info` when a fixed alias such as `"@plugin": ["./dist/plugin.js"]` points at a file the plugin doesn't analyze; ``RangeError: path should be a `path.relative()`d string`` when a directory with its own `.gitignore` has a sibling whose name starts the same way, such as `foo/` and `foo-bar/` (a regression in 1.3.0); and a `TypeError` when `no-restricted-imports` is enabled without options, which under Oxlint left the rule silently doing nothing. A missing configuration for `no-restricted-imports` is now reported as a configuration error
- Fixed directories being treated as inside another directory whose name they only start with, such as `vendor-extra/` and `vendor/`. `no-unresolved-imports` accepted a dependency listed only in the sibling's `package.json`, an alias into a sibling of the package or of tsconfig's `rootDir` was kept instead of dropped like other aliases outside them, and a `package.json` export in a sibling of `outDir` (`./dist-cjs/` for `./dist`) was mapped to a source file that doesn't exist instead of being warned about
- Fixed the cached analysis drifting out of sync in `fix` and `editor` mode. Imports with an empty or non-literal specifier (`import { x } from ''`, `import(someVariable)`) were dropped, which misaligned the cache for the rules that ran after them in the same lint pass, and a whitespace-only edit left cross-file references with stale source ranges. Every statement is now recorded, and a non-literal dynamic import is never reported

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
