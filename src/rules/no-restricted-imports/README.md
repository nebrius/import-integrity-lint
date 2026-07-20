# import-integrity/no-restricted-imports

Restricts which files can import which modules.

> AI agents: when fixing a violation of this rule, follow the repo's `import-integrity` skill if one is installed, or consult the [skill published with this plugin](https://github.com/nebrius/import-integrity-lint/blob/main/skills/import-integrity/SKILL.md). It covers the correct fix for each violation and which workarounds to avoid.

## Rule Details

This rule lets you define restrictions on which files can import which modules. Restrictions can apply to first-party files within your codebase or to third-party packages, and can use either string paths or regular expressions (with capture groups for parameterized restrictions).

Unlike most rules in Import Integrity, `no-restricted-imports` is not enabled in the default configuration. It requires rule-specific options that depend on your codebase's architecture, so it can't be configured automatically.

## Motivating example

Many frontend frameworks support loading bootstrap data at the page level. Next.js is the most common example: an async server component on a page route can load page-specific data and pass it to children via a React context. That context is only available within the subtree of that one page.

This pattern is powerful but fragile. Any component imported into a page-specific subtree may rely on that context to function. If a component that depends on a page-specific context is accidentally imported into a different page, things break (and often subtly). The hooks reading from the absent context return `undefined`, no exception is thrown, and downstream code limps along until something else fails in a way that doesn't point back to the actual problem.

`no-restricted-imports` can prevent this by enforcing folder-structure conventions at lint time. Consider this layout:

```
src/
├── app/
│   ├── settings/
│   │   └── page.tsx  // imports page-contents/settings/index.tsx
│   └── posts/
│       └── page.tsx  // imports page-contents/posts/index.tsx
├── components/
├── hooks/
└── page-contents/
    ├── settings/
    │   ├── components/
    │   ├── hooks/
    │   ├── context.ts
    │   └── index.tsx
    └── posts/
        ├── components/
        ├── hooks/
        ├── context.ts
        └── index.tsx
```

Next.js routes the URL `/settings` to `app/settings/page.tsx`, which imports the entry point of `page-contents/settings/`. Everything under `page-contents/settings/` uses the settings page's context. Same shape for posts. By configuring `no-restricted-imports` so that files under `page-contents/<page>/` can only be imported by `app/<page>/page.tsx` or by other files under `page-contents/<page>/`, the page-specific code is structurally walled off. A developer can't accidentally pull a settings-page component into the posts page, because the lint error would catch it before the runtime bug ever appears.

Another common use case is enforcing that low-level implementation details are always accessed through a designated wrapper, never directly. A virtualized file system, an internal logger, or a database driver might each have a thin wrapper that the rest of the codebase is required to use.

## Options

The rule takes one option, `rules`, which is an array of restriction definitions. Each entry has the following properties:

### `type`

The kind of module being restricted. Must be either `'first-party'` (files within your codebase) or `'third-party'` (npm packages or built-in modules).

### `filepath` (first-party only)

The file path being restricted. Can be a string or a regular expression. If a regular expression with capture groups is used, the groups can be referenced in `allowed` and `denied` as `$1`, `$2`, etc.

### `moduleSpecifier` (third-party only)

The module specifier being restricted. Can be a string or a regular expression.

### `allowed`

An array of file paths that are allowed to import the restricted module. Can be strings or regular expressions. If `filepath` and `allowed` are both regular expressions, capture groups from `filepath` can be referenced in `allowed`.

### `denied`

An array of file paths that are denied from importing the restricted module. Same shape as `allowed`. If both `allowed` and `denied` are specified, the import is allowed only if it matches `allowed` and does not match `denied`.

### `message`

An optional custom error message shown when a restriction is violated. Strongly recommended — telling the user *why* the import is restricted is much more useful than a generic error. For example: `"this component can only be used on the settings page"`.

### `excludeTypeImports`

A boolean. When `true`, type-only imports (`import type`) are not considered restricted even if the underlying export is. Defaults to `false`.

### File path matching

A note on how file paths are matched:

- String paths are interpreted as relative to the current package's `packageRootDir`.
- Regular expressions are matched against the **absolute** file path. This means a pattern like `/^\.\/a\.ts$/` will never match anything, because the file paths passed to the regex never start with `./`. Use patterns like `/\/a\.ts$/` or anchor against your project's absolute path.

## Examples

### Basic restriction

```js
// Configuration
{
  rules: [
    {
      type: 'first-party',
      filepath: './sensitive.ts',
      allowed: ['./wrapper.ts'],
      message: 'Only wrapper.ts may import sensitive.ts',
    },
  ],
}
```

```js
// wrapper.ts — allowed
import { thing } from './sensitive';

// other.ts — flagged
import { thing } from './sensitive';
```

### Page-isolated imports with capture groups

```js
// Configuration
{
  rules: [
    {
      type: 'first-party',
      filepath: /\/page-contents\/([^/]+)\//,
      allowed: [/\/page-contents\/$1\//],
      message: 'Page-specific code can only be imported within the same page',
    },
  ],
}
```

With this configuration, the regex captures the page name (`settings`, `posts`, etc.) and the `allowed` pattern references that capture as `$1`. A file under `page-contents/settings/` can only be imported by other files under `page-contents/settings/`.

### Restricting a third-party module

```js
// Configuration
{
  rules: [
    {
      type: 'third-party',
      moduleSpecifier: 'node:fs',
      allowed: ['./src/virtual-fs.ts'],
      message: 'Use virtual-fs.ts instead of importing node:fs directly',
    },
  ],
}
```

## Configuration

### When not to use this rule

This rule has no default behavior — without `rules` configured, it does nothing. There's no reason to "disable" it. If you don't have a use case for import restrictions, simply don't configure any rules.