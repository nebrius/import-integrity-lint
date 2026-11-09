---
title: Configuration
description: Overview of Import Integrity configuration modes and file locations.
outline: deep
---

# Configuration

Configuration options are split into two groups: repo-level configuration options and package-level configuration options. In the single package case, which we call "single package mode", there isn't a distinction between the two groups. When [using a lint config at the repo root](../guide/monorepos#option-2-one-root-config-with-monoreporootdir) to apply to more than one package, which we call "monorepo mode," repo-level options apply to all packages in the monorepo, while package-level options are specified per-package.

To support this "split-level" configuration, Import Integrity uses separate configuration files for package-level options that are independent of the ESLint/Oxlint configuration, while repo-level options go in `settings['import-integrity']` in the ESLint/Oxlint configuration file.

In single package mode, package-level options can also go in `settings['import-integrity']` if you prefer to not create a separate configuration file.

In monorepo mode, custom package-level options are required to be in a configuration file, not `settings['import-integrity']`. Import Integrity uses your monorepo's workspace configuration to determine which packages to analyze (supports Yarn, npm, Lerna, pnpm, Bun, and Rush). If a workspace package has a configuration file, Import Integrity loads its package-level options from that file. Workspace packages without a configuration file fall back to default values for all package-level options.

Configuration files are written using JSON-C (JSON with comments) and are named `import-integrity.config.json` or `import-integrity.config.jsonc`. These files must live in the package root dir as a sibling to `package.json` and `tsconfig.json`. The one exception is the [base config](#base-config), which lives at the monorepo root. In monorepo mode, you must set `name` in `package.json`, because this is used by Import Integrity for cross-package import analysis.

## Base config

A base config sets package-level options once for every package in a monorepo. It is named `import-integrity.base.json` or `import-integrity.base.jsonc`, accepts the same options as a package's configuration file, and lives at the monorepo root, next to your workspace configuration (`package.json` workspaces, `pnpm-workspace.yaml`, `rush.json`, and so on).

The base config is applied to every package as if its contents were written in that package's own configuration:

- Paths in it are relative to each package, just as they would be in the package's own configuration file.
- A package's own settings, from its configuration file or from `settings['import-integrity']` in single package mode, replace the base's value for each option they set. Options the package doesn't set keep the base's value.
- Replacement is per option, never merged within an option. This includes object-valued options such as `alias` and `entryPointFiles`.

For example, with this base config:

```jsonc
// import-integrity.base.jsonc
{
  "alias": { "@/*": "src/*" },
  "testFilePatterns": ["__custom_test__"],
}
```

and this package configuration:

```jsonc
// packages/web/import-integrity.config.jsonc
{
  "alias": { "~/*": "app/*" },
}
```

the `web` package's `alias` is only `{ "~/*": "app/*" }`. The base's `@/*` alias does not apply to it, because the package set `alias`. Its `testFilePatterns` is `["__custom_test__"]`, from the base.

Import Integrity finds the base config with the same workspace detection it uses to discover packages, so a lint run at the monorepo root and a lint run inside a single package both use the same base config. A base config only applies inside a workspace. A package that isn't part of one, or a `monorepoRootDir` without a workspace configuration, has no base config, so put its options in its own configuration file. With [`debugLogging`](./repo-level-options#debuglogging) enabled, Import Integrity logs which base config it used, or that it found no workspace.

## Next steps

- [Repo-level options](./repo-level-options) cover settings that apply to a whole package or monorepo.
- [Package-level options](./package-level-options) cover settings scoped to one package.
- [Monorepos](../guide/monorepos) covers the recommended setup patterns for workspace repositories.
