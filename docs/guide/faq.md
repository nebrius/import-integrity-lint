---
title: FAQ and caveats
description: Frequently asked questions and known limitations for Import Integrity.
outline: deep
---

# FAQ and caveats

## Frequently Asked Questions

### Is Import Integrity a replacement for eslint-plugin-import / eslint-plugin-import-x?

No, not for the most part. Import Integrity replaces a few select rules from `eslint-plugin-import` and `eslint-plugin-import-x` that are known to be slow, such as `no-cycle`, but otherwise strives to coexist with these packages. It is recommended that you continue to use rules these packages provide that Import Integrity does not.

### Does Import Integrity support CommonJS?

No. If your codebase mixes CommonJS and ESM, Import Integrity will report any imports of CommonJS exports as invalid imports. If you use mixed CommonJS/ESM or CommonJS only, you should not use this plugin.

### Does Import Integrity support user-supplied resolvers like eslint-plugin-import does?

No, by design. Off-the-shelf resolvers work by reading the filesystem to see what files are available, which is inherently slow. By contrast, Import Integrity uses its own resolution algorithm that reuses information already in memory so that it never has to touch the filesystem. This resolution algorithm is one of the key reasons Import Integrity is able to achieve the performance it does.

If Import Integrity's resolution algorithm does not support your use case, please file an issue and I'll try to add support for it.

For more information, see [Phase 2: Module specifier resolution](./how-it-works.html#phase-2-module-specifier-resolution).

### When should I use `entryPointFiles` vs `externallyImportedFiles`?

Both options exempt files from unused-export analysis, but they signal different things about *who* imports the file's exports:

- Use [`entryPointFiles`](../configuration/package-level-options.html#entrypointfiles) for files that are part of your package's public API — exports intended to be consumed by other code that imports your package (whether external consumers or other packages in your monorepo).

- Use [`externallyImportedFiles`](../configuration/package-level-options.html#externallyimportedfiles) for files whose exports are imported by an external system such as a framework — for example, Next.js's `page.tsx` files, which the Next.js runtime imports directly without your code referencing them.

The distinction matters most in monorepos. The [`no-unused-package-exports`](../rules/no-unused-package-exports/) rule (enabled in `monorepoRecommended`) flags entry-point exports that aren't imported by any other package in the monorepo. It doesn't flag externally-imported exports, since by definition those are consumed outside the monorepo.

In single-package setups, these options are the same in practice: both options exempt the file's exports from unused-export checking. Using the right one keeps your intent clear and makes the monorepo check work correctly if you ever add this package to a monorepo.

### Why do I see a warning that no code files in a package were analyzed?

Import Integrity logs this warning when it finished analyzing a package and found no code files in it, so every rule does nothing for that package. The causes, and the fix for each:

- **The package has no files with a supported extension.** This is expected for a package that only holds a shared `tsconfig.json` or ESLint config. In monorepo mode, add the package to [`ignorePackages`](../configuration/repo-level-options#ignorepackages).
- **`packageRootDir` points at the wrong directory**, such as an empty folder or a parent of the package. Point it at the directory that contains the package's `package.json`.
- **Every code file is in a folder or has a name that is ignored by default**, such as `dist`, or a checkout inside a hidden folder like `.worktrees`. See [`defaultIgnoreOverrides`](../configuration/package-level-options#defaultignoreoverrides).
- **Every code file matches `.gitignore` or `ignorePatterns`.** See [`ignoreOverridePatterns`](../configuration/package-level-options#ignoreoverridepatterns).
- **Every code file has a syntax error**, so none of them can be parsed.

The warning is logged once per package each time the linter starts. Under ESLint's `--concurrency` or with Oxlint's threads, each worker logs it once. It has no setting of its own to turn it off; `ignorePackages` is the way to tell Import Integrity a package has nothing to analyze.

## Caveats

### Non-named barrel export entry points are not tracked

If a barrel export doesn't use `* as foo`, the entry point of that barrel export isn't considered when analyzing cross-package imports. For example:

```js
// package-one/a.ts
export * from 'some-package';

// package-two/b.ts
import { something } from 'package-one/a';
```

Import Integrity won't see the second import. This means rules like [no-unused-package-exports](../rules/no-unused-package-exports/) won't flag this export as unused even if package-two stops importing it.

The [no-unnamed-entry-point-exports](../rules/no-unnamed-entry-point-exports/) rule addresses this caveat.

### ESLint inconsistently applies case sensitivity to file paths

If you pass a file pattern or path to ESLint, ESLint applies case insensitivity inconsistently. For example, given a file at `src/someFile.ts`, running `eslint src/somefile.ts` causes ESLint to parse the file but report the filename internally as `src/somefile.ts`. Import Integrity, however, only knows about the file at `src/someFile.ts`, which can lead to import resolution mismatches.

### Entry-point patterns with multiple wildcards are not supported

According to the Node.js spec, it's legal to define an export pattern with multiple wildcards:

```json
{
  "exports": {
    "./utils/*": "./src/*/utils/*/something/*.ts"
  }
}
```

In this case, the single `*` from the subpath repeats in the file path. Import Integrity doesn't currently support this pattern.