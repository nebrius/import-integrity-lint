---
title: Monorepos
description: Configure Import Integrity in monorepos.
outline: deep
---

# Monorepos

Import Integrity supports three setup patterns for monorepos, each with different tradeoffs around performance, configuration overhead, and which rules are available.

## Option 1: separate configs per package

_Use this when each package is linted independently._

Each package has its own ESLint or Oxlint config, with its own `packageRootDir` and the standard `recommended` config. The monorepo task runner (Nx, Turborepo, etc.) handles invoking the linter across packages.

In this setup, each config sees only its own package. This means cross-package rules like [no-unused-package-exports](../rules/no-unused-package-exports/index.md) can't be used with this setup because they require a config that sees the whole monorepo. If you need those rules, see Option 2 or 3.

### Setup

Create an ESLint config file in each package root directory and set `settings['import-integrity'].packageRootDir` to the package root directory.

**Example structure:**

```text
repo
└── packages
    ├── web
    │   ├── eslint.config.mjs
    │   └── src
    └── shared
        ├── eslint.config.mjs
        ├── import-integrity.config.jsonc
        └── src
```

In each package's ESLint config:

```js
import { defineConfig } from 'eslint/config';
import importIntegrityPlugin from 'import-integrity-lint';

export default defineConfig([
  {
    settings: {
      'import-integrity': {
        packageRootDir: import.meta.dirname,
      },
    },
  },
  importIntegrityPlugin.configs.recommended,
]);
```

To share package-level options across packages, put them in a [base config](../configuration/#base-config) at the monorepo root. Each package's lint run finds it through your workspace configuration.

## Option 2: one root config with `monorepoRootDir`

_Use this when you want a single config covering the whole monorepo, or when nested configs cause issues with other tools._

A single root-level config covers every package. Workspace packages are discovered from your monorepo configuration under `monorepoRootDir`. Options shared by every package can go in a [base config](../configuration/#base-config) at the monorepo root, and individual packages can override their settings with an `import-integrity.config.json` file at the package root.

::: warning
This option has performance implications for larger codebases, since we need to run a single lint job for the entire monorepo. This means we can't parallelize across packages or skip linting packages with no changes. See Option 3 for a more performant alternative.
:::

### Setup

1. Set `settings['import-integrity'].monorepoRootDir` in your root config and add the `monorepoRecommended` config.
2. Optionally add an `import-integrity.base.json` (or `.jsonc`) file at the monorepo root for package-scoped options that every package shares.
3. Optionally add an `import-integrity.config.json` (or `.jsonc`) file to any workspace package that needs its own package-scoped options.

**Example structure:**

```text
repo
├── eslint.config.mjs
├── import-integrity.base.jsonc
└── packages
    ├── web
    │   └── src
    └── shared
        ├── import-integrity.config.jsonc
        └── src
```

Root ESLint config:

```js
import { defineConfig } from 'eslint/config';
import importIntegrityPlugin from 'import-integrity-lint';

export default defineConfig([
  {
    settings: {
      'import-integrity': {
        monorepoRootDir: import.meta.dirname,
      },
    },
  },
  importIntegrityPlugin.configs.monorepoRecommended,
]);
```

`shared` package import-integrity config:

```jsonc
{
  "testFilePatterns": ["__custom_test__"]
}
```

Note: config files outside the declared workspace globs are ignored, except for the base config at the monorepo root.

## Option 3: root + separate configs (recommended)

_Recommended for most monorepos. Combines a minimal root config for repo-wide rules with per-package configs for performance._

This setup uses a minimal root config to enable repo-wide rules (like no-unused-package-exports) alongside per-package configs that handle everything else. Both run, orchestrated by your monorepo task runner.

### Why this is faster

ESLint is single-threaded by default, so a single root config that lints the whole monorepo runs serially. Oxlint itself is multi-threaded, but Oxlint's JS plugins (including Import Integrity) are not, so we still run into the same performance limitation.

Per-package configs can be parallelized and cached by task runners like Nx and Turborepo, which makes a noticeable difference for editor responsiveness and AI agents using LSP integrations.


### Setup

1. In your root config, set `settings['import-integrity'].monorepoRootDir` and add the `monorepoRecommended` config.
2. In each package's config, set `settings['import-integrity'].packageRootDir` and add the regular `recommended` config.
3. If every package needs the same non-default options (alias, testFilePatterns, etc.), add an `import-integrity.base.json` file at the monorepo root. Both the root run and each package's run use it.
4. If a package needs its own non-default options, add an `import-integrity.config.json` file at the package root. Don't put these settings in the package's ESLint config.

**Example structure:**

```text
repo
├── eslint.config.mjs
├── import-integrity.base.jsonc
└── packages
    ├── web
    │   ├── eslint.config.mjs
    │   └── src
    └── shared
        ├── eslint.config.mjs
        ├── import-integrity.config.jsonc
        └── src
```

Root config:

```js
import { defineConfig } from 'eslint/config';
import importIntegrityPlugin from 'import-integrity-lint';

export default defineConfig([
  {
    settings: {
      'import-integrity': {
        monorepoRootDir: import.meta.dirname,
      },
    },
  },
  importIntegrityPlugin.configs.monorepoRecommended,
]);
```

`shared` and `web` package configs:

```js
import { defineConfig } from 'eslint/config';
import importIntegrityPlugin from 'import-integrity-lint';

export default defineConfig([
  {
    settings: {
      'import-integrity': {
        packageRootDir: import.meta.dirname,
      },
    },
  },
  importIntegrityPlugin.configs.recommended,
]);
```

For a complete working example of this approach, see [Aquarium Control](https://github.com/nebrius/aquarium-control).

**Oxlint nested-config caveat:** Oxlint has a known issue with nested configs in LSP contexts (editors, AI agents). If you hit this, use Option 2 until [this issue](https://github.com/oxc-project/oxc/issues/19937) is resolved. ESLint isn't affected.