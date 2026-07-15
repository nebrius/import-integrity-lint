# CHANGELOG

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
