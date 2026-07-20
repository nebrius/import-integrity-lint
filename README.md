# Import Integrity

Helps keep imports correct and tidy.

[![npm version](https://badge.fury.io/js/import-integrity-lint.svg)](https://badge.fury.io/js/import-integrity-lint) ![ci workflow](https://github.com/nebrius/import-integrity-lint/actions/workflows/ci.yml/badge.svg) [![codecov](https://codecov.io/gh/nebrius/import-integrity-lint/graph/badge.svg?token=T6O54TXTKU)](https://codecov.io/gh/nebrius/import-integrity-lint)

A high-performance ESLint and Oxlint plugin for analyzing import and export relationships across your codebase. It catches dead code, broken imports, and architectural violations that other tools miss, while running faster than most alternatives.

- 👻 **Finds dead exports** that other tools can't, like exports only used in tests
- 🗂️ **Keeps your code organized** through architectural rules that scale with your codebase
- 📦 **Built for monorepos** with first-class cross-package analysis
- 🤖 **Guardrails for agentic coding** that catch common AI-generated mistakes before they ship

> [!TIP]
> **Migrating from `import-integrity-lint`?** See the [migration guide](https://nebrius.github.io/import-integrity-lint/guide/migration).

## Quickstart

Install:

```bash
npm install --save-dev import-integrity-lint
```

### ESLint

Minimal `eslint.config.js`:

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

This is enough for a single-package JavaScript codebase. For TypeScript, monorepos, and other real-world setups, see the [Quickstart documentation](https://nebrius.github.io/import-integrity-lint/guide/quickstart).

### Oxlint

Add to your `oxlint.config.ts`:

```js
import importIntegrityPlugin from 'import-integrity-lint';

export default {
  settings: {
    'import-integrity': {
      packageRootDir: import.meta.dirname,
    },
  },
  jsPlugins: [
    {
      name: 'import-integrity',
      specifier: 'import-integrity-lint',
    },
  ],
  rules: {
    ...importIntegrityPlugin.configs.recommended.rules,
  },
};
```

Then run ESLint/Oxlint as usual. Import Integrity will analyze your imports and exports and flag issues based on its recommended ruleset.

For configuration options, the full rules reference, monorepo setup, comparisons with other tools, and more, see the [documentation](https://nebrius.github.io/import-integrity-lint).

## For AI agents

This package ships an [agent skill](skills/import-integrity/SKILL.md) that teaches AI coding agents how to correctly fix rule violations, including which "fixes" mask problems instead of solving them. Coding agents that support [Agent Skills](https://agentskills.io) will pick it up automatically once it's installed in your repo:

```bash
npx skills add nebrius/import-integrity-lint
```

## License

Copyright (c) 2026 Bryan Hughes

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
