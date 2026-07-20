# import-integrity/require-node-prefix

Requires that Node.js built-in module imports are prefixed with `node:`.

> AI agents: when fixing a violation of this rule, follow the repo's `import-integrity` skill if one is installed, or consult the [skill published with this plugin](https://github.com/nebrius/import-integrity-lint/blob/main/skills/import-integrity/SKILL.md). It covers the correct fix for each violation and which workarounds to avoid.

## Rule Details

Node.js built-ins can be imported as either `'<module-name>'` or `'node:<module-name>'`. This rule enforces the `node:`-prefixed form.

The `node:` prefix has several benefits:

- It makes the import obviously a built-in at a glance, instead of looking like a third-party package
- It lets import-sorting tools like [`eslint-plugin-simple-import-sort`](https://github.com/lydell/eslint-plugin-simple-import-sort) group built-ins separately from third-party imports
- It's the only form that works for some newer built-ins. For example, `node:test` and `node:sea` must be imported with the prefix; the unprefixed form does not exist for those modules
- It is required by Bun and Deno

This rule is auto-fixable — running ESLint with `--fix` rewrites unprefixed imports to use the `node:` form.

## Examples

### Incorrect

```js
import { readFile } from 'fs/promises';
import path from 'path';
import { createHash } from 'crypto';
```

### Correct

```js
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
```

## Configuration

### Options

This rule has no options.

### When not to use this rule

We don't recommend disabling this rule. If a contributor adds an unprefixed import out of habit, the rule auto-fixes it. Disabling means accepting inconsistency in the codebase.

If you're targeting Node.js versions that don't support the `node:` prefix (Node 12 and earlier), the right action isn't to disable this rule. The right action is to upgrade. Those Node versions have been end-of-life since 2022 and no longer receive security updates. Running them in production is unsafe regardless of import style.