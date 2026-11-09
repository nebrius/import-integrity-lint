# import-integrity/no-restricted-imports

Restricts which files can import which modules.

> AI agents: when fixing a violation of this rule, follow the repo's `import-integrity` skill if one is installed, or consult the [skill published with this plugin](https://github.com/nebrius/import-integrity-lint/blob/main/skills/import-integrity/SKILL.md). It covers the correct fix for each violation and which workarounds to avoid.

## Rule Details

This rule lets you define restrictions on which files can import which modules. Restrictions can apply to first-party files within your codebase or to third-party packages, and can use either string paths or regular expressions (with capture groups for parameterized restrictions). Regular expressions can be written as `RegExp` literals or, in JSON and Oxlint configs, as `{ regex, flags }` objects.

Unlike most rules in Import Integrity, `no-restricted-imports` is not enabled in the default configuration. It requires rule-specific options that depend on your codebase's architecture, so it can't be configured automatically. Enabling it without options is a configuration error, and linting stops with a message saying so.

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

The rule takes one option, `rules`, which is an array of restriction definitions. Each entry has the following properties.

Every property below that accepts a pattern takes one of:

- a string, matched exactly
- a `RegExp` literal, such as `/\/page-contents\//`
- an object `{ regex: string, flags?: string }`, which is turned into `new RegExp(regex, flags)`. Use this form in JSON configs and in Oxlint configs, where `RegExp` literals don't survive (see [Regular expressions in JSON and Oxlint configs](#regular-expressions-in-json-and-oxlint-configs))

Regular expressions can't use the `g` or `y` flags. Both make a regular expression continue from where its previous match ended, and the same pattern is reused for every file, so it would match some files and not others. A pattern with either flag is reported as a configuration error.

### `type`

The kind of module being restricted. Must be either `'first-party'` (files within your codebase) or `'third-party'` (npm packages or built-in modules).

### `filepath` (first-party only)

The file path being restricted, as a pattern. If it is a regular expression with capture groups, the groups can be referenced in `allowed` and `denied` regular expressions as `$1`, `$2`, etc. (see [Capture group references](#capture-group-references)).

### `moduleSpecifier` (third-party only)

The module specifier being restricted, as a pattern.

### `allowed`

An array of file path patterns that are allowed to import the restricted module. If `filepath` is a regular expression, its capture groups can be referenced in `allowed` regular expressions.

### `denied`

An array of file paths that are denied from importing the restricted module. Same shape as `allowed`. If both `allowed` and `denied` are specified, the import is allowed only if it matches `allowed` and does not match `denied`.

### `message`

An optional custom error message shown when a restriction is violated. Strongly recommended — telling the user *why* the import is restricted is much more useful than a generic error. For example: `"this component can only be used on the settings page"`.

### `excludeTypeImports`

A boolean. When `true`, type-only imports and re-exports (`import type`, `export type ... from`) are not considered restricted even if the underlying export is. Defaults to `false`.

### File path matching

A note on how file paths are matched:

- String paths are interpreted as relative to the current package's `packageRootDir`.
- Regular expressions are matched against the **absolute** file path. This means a pattern like `/^\.\/a\.ts$/` will never match anything, because the file paths passed to the regex never start with `./`. Use patterns like `/\/a\.ts$/` or anchor against your project's absolute path.

### Capture group references

When `filepath` is a regular expression, `$N` in an `allowed` or `denied` regular expression is replaced with the text captured by group `N` of the `filepath` match:

- All digits after the `$` belong to the reference, so `$10` is group 10. To follow a reference with a literal digit, wrap the digit, as in `$1[0]`.
- The captured text is matched literally, so a `.` in a captured folder name matches only a `.`.
- A group that didn't take part in the match is replaced with nothing.
- `\$` is a literal dollar sign and is never a reference.
- A reference must refer to a group that exists in that entry's `filepath`. A reference with no group to refer to, including any reference in a third-party entry or in an entry whose `filepath` is a string, could never match, so it is reported as a configuration error.

### Regular expressions in JSON and Oxlint configs

`RegExp` literals only work in a JavaScript or TypeScript ESLint config. Oxlint serializes its config to JSON before passing options to the rule, including when the config is `oxlint.config.ts`, and a `RegExp` doesn't survive JSON serialization: it arrives as an empty object `{}`. The same applies to any JSON config file.

In those configs, write each regular expression as `{ regex, flags }`. The `regex` string is the pattern source, with the backslashes JSON requires. The rule reports a `RegExp` that was serialized to `{}` as a configuration error, explaining what happened.

```jsonc
// .oxlintrc.json
{
  "rules": {
    "import-integrity/no-restricted-imports": [
      "error",
      {
        "rules": [
          {
            "type": "first-party",
            "filepath": { "regex": "\\/page-contents\\/([^/]+)\\/" },
            "allowed": [{ "regex": "\\/page-contents\\/$1\\/" }],
            "message": "Page-specific code can only be imported within the same page"
          }
        ]
      }
    ]
  }
}
```

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

With this configuration, the regex captures the page name (`settings`, `posts`, etc.) and the `allowed` pattern references that capture as `$1`. A file under `page-contents/settings/` can only be imported by other files under `page-contents/settings/`. For the same configuration in a JSON or Oxlint config, see [Regular expressions in JSON and Oxlint configs](#regular-expressions-in-json-and-oxlint-configs).

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