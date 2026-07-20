# import-integrity/prefer-alias-imports

Enforces the use of alias imports instead of relative paths when an alias is available, with optional support for keeping nearby imports relative.

> AI agents: when fixing a violation of this rule, follow the repo's `import-integrity` skill if one is installed, or consult the [skill published with this plugin](https://github.com/nebrius/import-integrity-lint/blob/main/skills/import-integrity/SKILL.md). It covers the correct fix for each violation and which workarounds to avoid.

## Rule Details

When a package configures import aliases (e.g. `@/*` mapping to `src/*`), it can be inconsistent whether developers use relative paths or alias paths. One developer writes `import { Button } from '@/components/Button'`, another writes `import { Button } from './Button'`, and the codebase ends up with both styles for the same import. This rule enforces a consistent style.

This rule is auto-fixable — most violations can be resolved by running ESLint with `--fix`.

The rule has two modes:

### `relative-if-local` (default)

The default mode optimizes for readability. Imports between files that are "near" each other use relative paths, since the relationship between them is short and easy to read. Imports between files that aren't near each other use alias paths, since the relative path would have too many `../` segments to be readable.

"Near" is defined by [`minSharedPathDepth`](#minsharedpathdepth): two files are considered near if they share at least that many path segments below the alias root. With the default value of `1`, files in the same top-level folder under the alias (e.g. both under `src/components/`) are considered near.

### `always`

The `always` mode prefers alias imports unconditionally. Any relative import that could use an alias instead is flagged. This mode is simpler but produces longer paths for nearby files.

## Examples

The examples below assume `alias: { '@/*': 'src/*' }` and the following file structure:

```
.
├── package.json
└── src
    ├── components
    │   ├── Button.ts
    │   └── Card.ts
    └── utils
        └── helper.ts
```

### `relative-if-local` mode (default)

#### Incorrect

```js
// src/components/Card.ts

// Wrong: uses alias for a local file in the same top-level folder
import { Button } from '@/components/Button';

// Wrong: uses a relative path across top-level folders
import { helper } from '../utils/helper';
```

#### Correct

```js
// src/components/Card.ts

// Correct: relative path for a nearby file
import { Button } from './Button';

// Correct: alias path across top-level folders
import { helper } from '@/utils/helper';
```

### `always` mode

#### Incorrect

```js
// src/components/Card.ts

// Wrong: relative path when an alias is available
import { Button } from './Button';
import { helper } from '../utils/helper';
```

#### Correct

```js
// src/components/Card.ts

// Correct: alias paths everywhere
import { Button } from '@/components/Button';
import { helper } from '@/utils/helper';
```

## Configuration

### Options

#### `mode`

Type: `'relative-if-local' | 'always'`

Default: `'relative-if-local'`

Controls when alias imports are preferred over relative imports. See [Rule Details](#rule-details) for details on each mode.

#### `minSharedPathDepth`

Type: `number`

Default: `1`

The minimum number of shared path segments (counted from the alias root, using resolved absolute file paths) before `relative-if-local` mode considers two files near enough for a relative import. Only applies when `mode` is `'relative-if-local'`.

For example, with `@/*` mapping to `src/*` and `minSharedPathDepth: 2`, files at `src/components/forms/Input.ts` and `src/components/forms/Label.ts` would use relative paths between each other (they share two segments below `src/`: `components/forms`), but files at `src/components/Button.ts` and `src/components/forms/Input.ts` would use the alias (only one shared segment).

### When not to use this rule

We don't recommend disabling this rule if you use aliases. The rule is auto-fixable, so the typical workflow is to run `--fix` once and let the rule keep your imports consistent going forward. If you don't use aliases at all, the rule does nothing.

If you have a strong preference for always using relative paths or always using alias paths regardless of the configured alias structure, this rule with `mode: 'always'` matches the "always alias" preference. For "always relative," the fix is to remove the alias from your configuration. Without an alias, there's nothing for this rule to prefer.