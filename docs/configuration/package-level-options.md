---
title: Package-level options
description: Package-level Import Integrity configuration options.
outline: deep
---

# Package-level options

The remaining options are package-scoped. In single-repo mode, place them in `settings['import-integrity']` or in a `import-integrity.config.json`/`import-integrity.config.jsonc` file in `packageRootDir` (but not both). In monorepo mode, place them in a package's Import Integrity config if that package needs non-default values. The examples below use the single-repo form.

## `alias`

Type: `Record<string, string>`

Default: aliases in `tsconfig.json`

`alias` defines a set of module specifier aliases. For example, if you use Next.js with its default configuration, you're probably familiar with the alias it creates: `@/` points to `src/`, such that a file inside of `src` can import `src/components/foo/index.ts` with `@/components/foo`.

Import Integrity defaults to the values inside of `tsconfig.json`, if present, with a few limitations:

- Aliases that point to files outside of `packageRootDir`, or point to files inside of `node_modules`, `build`, `out`, `dist`, or any folder or file that starts with a `.`, are ignored
- Aliases with more than one file, e.g. `"@/": ["a.ts", "b.ts"]`, are ignored

Example:

```js
{
  settings: {
    'import-integrity': {
      packageRootDir: import.meta.dirname,
      alias: {
        '@/*': 'src/*',
        'foo': 'src/foo.ts',
      },
    },
  },
}
```

Note: patterns with a single star after them will match any symbols/files that start with the symbol/filepath.

## `entryPointFiles`

Type: `Record<string, string>`

Default: package.json entry points under certain conditions, else `{}`

Files representing your package's public API — the set of files whose exports are intended to be consumed by code outside this package. All exports from any matching file are treated as entry points and are exempted from unused-export analysis within the package.

`entryPointFiles` is specified as an object of subpaths to files, like the `exports` field in `package.json` (without conditions), including the use of `*` as a wildcard. See the [Node.js package entry points documentation](https://nodejs.org/api/packages.html#package-entry-points) for more info. Note the [limitation on entry-point patterns with more than one wildcard](../guide/faq.html#entry-point-patterns-with-multiple-wildcards-are-not-supported).

Example:

```js
{
  settings: {
    'import-integrity': {
      packageRootDir: import.meta.dirname,
      entryPointFiles: {
        '.': './src/index.ts',
      },
    },
  },
}
```

### Auto-inference

Entry points are inferred automatically if your `package.json` declares `exports` or `main` and one of the following is true:

- Your `tsconfig.json` declares both `outDir` and `rootDir`, in which case Import Integrity maps the compiled output paths (what `package.json` points to) back to the source paths (what Import Integrity needs).
- The file `package.json` points to has a `.ts`, `.mts`, or `.cts` extension, in which case the path is used directly.
- The file `package.json` points to exists on disk as-is — e.g. a pure-JavaScript package whose `exports` reference source files directly — in which case the path is used directly. Declaration files (`.d.ts`, `.d.mts`, `.d.cts`) are excluded, since those are compiled artifacts.

Inferred entry points are merged with any `entryPointFiles` you provide. If both define an entry for the same subpath (e.g. `"."`), your value takes precedence; inferred entries for subpaths you didn't specify are kept.

### Use in monorepos

Entry points are particularly meaningful in monorepos. The [no-unused-package-exports](../rules/no-unused-package-exports/) rule (enabled in `monorepoRecommended`) checks whether entry-point exports are imported by any other package in the monorepo, flagging those that are not. See [Monorepos](../guide/monorepos.html) for more info.

If you're not sure whether to use `entryPointFiles` or `externallyImportedFiles`, see [the FAQ entry on choosing between them](../guide/faq.html#when-should-i-use-entrypointfiles-vs-externallyimportedfiles).

## `externallyImportedFiles`

Type: `string[]`

Default: Next.js values if Next.js is detected, else `[]`

Files whose exports are imported by external systems such as frameworks, not by code inside the codebase. All exports from any matching file are treated as externally imported and are exempted from unused-export analysis.

`externallyImportedFiles` is specified as an array of strings using `.gitignore`-style syntax, including `/` to anchor an entry to the root of the package, and `*` and `**` as wildcards.

Example:

```js
{
  settings: {
    'import-integrity': {
      packageRootDir: import.meta.dirname,
      externallyImportedFiles: [
        '/src/app/**/page.tsx',
        '/src/app/**/layout.tsx',
      ],
    },
  },
}
```

### Auto-inference

Inferred patterns are merged with any `externallyImportedFiles` you provide. The following patterns are inferred:

- **Config files.** Files matching `/*.config.*` (e.g. `eslint.config.mjs`, `vite.config.ts`, `tailwind.config.js`) are always included.
- **Next.js routing files.** When Next.js is detected, the appropriate patterns are inferred for app router or pages router projects, with or without a `src/` directory. If your project uses both routers, only the app router defaults are inferred.

### Use with `entryPointFiles`

If a file is part of your package's public API rather than imported by an external system, use [`entryPointFiles`](#entrypointfiles) instead. For a fuller discussion of when to use which, see [the FAQ entry on choosing between them](../guide/faq.html#when-should-i-use-entrypointfiles-vs-externallyimportedfiles).

## `ignorePatterns`

Type: `string[]`

Default: `[]`

A list of ignore patterns, using the format used by `.gitignore` files. Files that match these patterns are excluded from analysis.

By default, Import Integrity includes the contents of all `.gitignore` files that apply to each file, taking into account nesting, between the file in question and the closest parent folder that contains a `.git` folder. In other words, if you have a fully fleshed out `.gitignore` setup, you can ignore this setting.

Example:

```js
{
  settings: {
    'import-integrity': {
      packageRootDir: import.meta.dirname,
      ignorePatterns: [
        'src/**/__test__/**/snapshot/**/*',
        '*.pid',
      ],
    },
  },
}
```

## `ignoreOverridePatterns`

Type: `string[]`

Default: `[]`

A list of "inverse" ignore patterns that negate other ignore patterns, using the format used by `.gitignore` files. This pattern is useful if your `.gitignore` file includes generated code that is needed for proper import/export analysis.

Example:

```js
{
  settings: {
    'import-integrity': {
      packageRootDir: import.meta.dirname,
      ignoreOverridePatterns: [
        'src/generated/**/*.ts',
      ],
    },
  },
}
```

## `testFilePatterns`

Type: `string[]`

Default: `[ '.test.', '.spec', '__test__', '__tests__', '__fixture__', '/test/', '/tests/' ]`

Several rules take into account whether or not a given file is a "test" file or a "production" file. This option allows you to define extra patterns in addition to the default to indicate other test files. Note that globs are not currently supported.

Example:

```js
{
  settings: {
    'import-integrity': {
      packageRootDir: import.meta.dirname,
      testFilePatterns: ['__custom_test__'],
    },
  },
}
```
