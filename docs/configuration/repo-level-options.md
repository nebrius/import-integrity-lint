---
title: Repo-level options
description: Repo-level Import Integrity configuration options.
outline: deep
---

# Repo-level options

Repo-level options apply to the package or monorepo being analyzed.

## `packageRootDir`

Type: `string`

Import Integrity uses `packageRootDir` to scan for files in the current package. When Import Integrity starts up for the first time, it creates a map of all files inside of `packageRootDir`, filters out any ignored files (see [`ignorePatterns`](./package-level-options#ignorepatterns) for more info), and analyzes the remaining files.

Note: Import Integrity does not analyze files in folders named `node_modules`, `build`, `out`, `dist`, and any folder or file that starts with a `.`, regardless of ignore settings. These folders are almost always ignored anyways, and hard-coding this list improves performance. The only exception is `.worktrees`, so that git worktrees checked out inside a hidden folder are still analyzed. If you want to analyze files in another dot-prefixed folder, file an issue and we'll find a way to support your use case.

In single package mode, you must set `packageRootDir` directly in `settings['import-integrity']`.

In monorepo mode, every package still has a `packageRootDir` under the hood, but it is automatically set to the directory discovered from the workspace configuration.

`packageRootDir` must be an absolute path that points to the directory containing the package's `package.json` and `tsconfig.json`, not a nested `src` directory.

CommonJS Example:

```js
{
  settings: {
    'import-integrity': {
      packageRootDir: __dirname,
    },
  },
}
```

ESM Example:

```js
{
  settings: {
    'import-integrity': {
      packageRootDir: import.meta.dirname,
    },
  },
}
```

## `monorepoRootDir`

Type: `string`

`monorepoRootDir` is the absolute path to the monorepo root. Import Integrity uses your monorepo's workspace configuration to discover packages underneath this directory. Each discovered workspace package becomes a package root. If a workspace package contains `import-integrity.config.json` or `import-integrity.config.jsonc` at its root, Import Integrity loads package-level settings from that file; otherwise default package-level settings are used. Config files outside the package root directories of declared workspace packages are ignored.

`packageRootDir` and `monorepoRootDir` are mutually exclusive and cannot both be defined.

Example:

```js
{
  settings: {
    'import-integrity': {
      monorepoRootDir: import.meta.dirname,
    },
  },
}
```

For details on how to structure your config when using `monorepoRootDir`, see the [Monorepos](../guide/monorepos.html) guide.

## `mode`

Type: `'auto' | 'one-shot' | 'fix' | 'editor'`

Default: `'auto'`

When set to `auto`, Import Integrity chooses a mode based on the current environment:

- `editor` when running inside supported editors such as VS Code, Cursor, or Windsurf
- `fix` when Oxlint or ESLint are run with `--fix`, `--fix-dry-run`, or `--fix-type`
- `one-shot` otherwise

`one-shot` mode assumes that each file will be linted exactly once. This mode optimizes for running ESLint or Oxlint from the command line without a fix flag. In this mode, Import Integrity first creates a map of all files, but does not enable update-oriented cache refreshes because it is assumed files will not be updated throughout the duration of the run. This mode should be used in CI.

`fix` builds on `one-shot` by introducing the caching layer. Each time a rule is called, Import Integrity updates its cache if any imports/exports are modified in a file.

`editor` builds on `fix` by adding a file watcher that looks for changes at a regular interval defined by [`editorUpdateRate`](#editorupdaterate). When changes are detected, the file map is updated. This allows Import Integrity to respond to changes outside of the editor, such as when running `git checkout` or `git stash`.

Example:

```js
{
  settings: {
    'import-integrity': {
      packageRootDir: import.meta.dirname,
      mode: 'editor',
    },
  },
}
```

Notes:

- ESLint editor detection works by inspecting the running process for the VS Code, Cursor, or Windsurf executable. These are currently the only editors detected automatically. If you use ESLint with a different editor, open an issue and I'll work with you to add support. In the meantime, you can create a config that extends your standard config, set the mode to `editor`, and tell your editor to use the derived config.
- Oxlint is reliably detected regardless of editor as long as the `--lsp` flag is passed to Oxlint.

## `editorUpdateRate`

Type: `number`

Default: `500`

Defines the rate in milliseconds at which editor-mode file watching checks for file changes.

Example:

```js
{
  settings: {
    'import-integrity': {
      packageRootDir: import.meta.dirname,
      editorUpdateRate: 2_000,
    },
  },
}
```

## `debugLogging`

Type: `boolean`

Default: `false`

When set to `true`, enables verbose logging that tells you performance numbers, when files are updated, and more.

Example:

```js
{
  settings: {
    'import-integrity': {
      packageRootDir: import.meta.dirname,
      debugLogging: true,
    },
  },
}
```
