import { join } from 'node:path';

import { RuleTester } from '@typescript-eslint/rule-tester';

import { preferAliasImports } from '../rule.js';

const TEST_PACKAGE_DIR = join(import.meta.dirname, 'project');
const FILE_INDEX = join(TEST_PACKAGE_DIR, 'src', 'index.ts');
const FILE_BUTTON = join(TEST_PACKAGE_DIR, 'src', 'components', 'Button.ts');
const FILE_LABEL = join(
  TEST_PACKAGE_DIR,
  'src',
  'components',
  'internal',
  'Label.ts'
);
const FILE_STANDALONE = join(TEST_PACKAGE_DIR, 'standalone.ts');

const ruleTester = new RuleTester({
  languageOptions: {
    parserOptions: {
      projectService: {
        allowDefaultProject: [
          '*.ts*',
          'src/*.ts*',
          'src/components/*.ts*',
          'src/utils/*.ts*',
          'src/components/internal/*.ts*',
        ],
      },
      tsconfigRootDir: TEST_PACKAGE_DIR,
    },
  },
});

const WILDCARD_SETTINGS = {
  'import-integrity': {
    packageRootDir: TEST_PACKAGE_DIR,
    alias: {
      '@/*': './src/*',
    },
    mode: 'fix',
  },
};

const WILDCARD_AND_FIXED_SETTINGS = {
  'import-integrity': {
    packageRootDir: TEST_PACKAGE_DIR,
    alias: {
      '@/*': './src/*',
      '@standalone': './standalone.ts',
    },
    mode: 'fix',
  },
};

// =============================================================================
// mode: 'always'
// =============================================================================

ruleTester.run('prefer-alias-imports (always)', preferAliasImports, {
  valid: [
    // Already using alias
    {
      code: `import { Button } from '@/components/Button';\n`,
      filename: FILE_INDEX,
      settings: WILDCARD_SETTINGS,
      options: [{ mode: 'always' }],
    },
    // Third-party import (not first-party)
    {
      code: `import { foo } from 'lodash';\n`,
      filename: FILE_INDEX,
      settings: WILDCARD_SETTINGS,
      options: [{ mode: 'always' }],
    },
    // A dynamic import with a non-literal specifier can't be rewritten, even
    // when the literal form would be reported
    {
      code: `const target = './components/Button';\nvoid import(target);\n`,
      filename: FILE_INDEX,
      settings: WILDCARD_SETTINGS,
      options: [{ mode: 'always' }],
    },
    // Relative import outside any alias path
    {
      code: `import { standalone } from '../standalone';\n`,
      filename: FILE_INDEX,
      settings: {
        'import-integrity': {
          packageRootDir: TEST_PACKAGE_DIR,
          alias: {
            '@/*': './src/*',
          },
          mode: 'fix',
        },
      },
      options: [{ mode: 'always' }],
    },
    // No aliases configured
    {
      code: `import { Button } from './components/Button';\n`,
      filename: FILE_INDEX,
      settings: {
        'import-integrity': {
          packageRootDir: TEST_PACKAGE_DIR,
          mode: 'fix',
        },
      },
      options: [{ mode: 'always' }],
    },
  ],

  invalid: [
    // Relative import replaceable by wildcard alias (from src/index.ts)
    {
      code: `import { Button } from './components/Button';\n`,
      filename: FILE_INDEX,
      settings: WILDCARD_SETTINGS,
      options: [{ mode: 'always' }],
      errors: [{ messageId: 'preferAlias' }],
      output: `import { Button } from '@/components/Button';\n`,
    },
    // Deeper relative import (from src/components/Button.ts)
    {
      code: `import { helper } from '../utils/helper';\n`,
      filename: FILE_BUTTON,
      settings: WILDCARD_SETTINGS,
      options: [{ mode: 'always' }],
      errors: [{ messageId: 'preferAlias' }],
      output: `import { helper } from '@/utils/helper';\n`,
    },
    // Relative import into subdirectory (from src/components/Button.ts)
    {
      code: `import { Label } from './internal/Label';\n`,
      filename: FILE_BUTTON,
      settings: WILDCARD_SETTINGS,
      options: [{ mode: 'always' }],
      errors: [{ messageId: 'preferAlias' }],
      output: `import { Label } from '@/components/internal/Label';\n`,
    },
    // Label importing Button (parent directory) — converted in always mode
    {
      code: `import { Button } from '../Button';\n`,
      filename: FILE_LABEL,
      settings: WILDCARD_SETTINGS,
      options: [{ mode: 'always' }],
      errors: [{ messageId: 'preferAlias' }],
      output: `import { Button } from '@/components/Button';\n`,
    },
    // Preserves file extension
    {
      code: `import { Button } from './components/Button.ts';\n`,
      filename: FILE_INDEX,
      settings: WILDCARD_SETTINGS,
      options: [{ mode: 'always' }],
      errors: [{ messageId: 'preferAlias' }],
      output: `import { Button } from '@/components/Button.ts';\n`,
    },
    // Fixed alias match
    {
      code: `import { standalone } from '../standalone';\n`,
      filename: FILE_INDEX,
      settings: WILDCARD_AND_FIXED_SETTINGS,
      options: [{ mode: 'always' }],
      errors: [{ messageId: 'preferAlias' }],
      output: `import { standalone } from '@standalone';\n`,
    },
    // Reexport
    {
      code: `export { Button } from './components/Button';\n`,
      filename: FILE_INDEX,
      settings: WILDCARD_SETTINGS,
      options: [{ mode: 'always' }],
      errors: [{ messageId: 'preferAlias' }],
      output: `export { Button } from '@/components/Button';\n`,
    },
    // Barrel reexport
    {
      code: `export * from './components/Button';\n`,
      filename: FILE_INDEX,
      settings: WILDCARD_SETTINGS,
      options: [{ mode: 'always' }],
      errors: [{ messageId: 'preferAlias' }],
      output: `export * from '@/components/Button';\n`,
    },
    // Side-effect import
    {
      code: `import './components/Button';\n`,
      filename: FILE_INDEX,
      settings: WILDCARD_SETTINGS,
      options: [{ mode: 'always' }],
      errors: [{ messageId: 'preferAlias' }],
      output: `import '@/components/Button';\n`,
    },
  ],
});

// =============================================================================
// mode: 'relative-if-local' (default)
// =============================================================================

ruleTester.run('prefer-alias-imports (relative-if-local)', preferAliasImports, {
  valid: [
    // Relative into subdirectory within the same top-level alias folder — should NOT flag
    {
      code: `import { Label } from './internal/Label';\n`,
      filename: FILE_BUTTON,
      settings: WILDCARD_SETTINGS,
    },
    // Relative from subdirectory to parent within the same top-level alias folder — should NOT flag
    {
      code: `import { Button } from '../Button';\n`,
      filename: FILE_LABEL,
      settings: WILDCARD_SETTINGS,
    },
    // Alias used across top-level alias folders — should NOT flag
    {
      code: `import { helper } from '@/utils/helper';\n`,
      filename: FILE_BUTTON,
      settings: WILDCARD_SETTINGS,
    },
    // Alias used from the alias root into a top-level folder — should NOT flag
    {
      code: `import { Button } from '@/components/Button';\n`,
      filename: FILE_INDEX,
      settings: WILDCARD_SETTINGS,
    },
    // Third-party import
    {
      code: `import { foo } from 'lodash';\n`,
      filename: FILE_INDEX,
      settings: WILDCARD_SETTINGS,
    },
  ],

  invalid: [
    // Relative import from outside alias scope should use alias
    {
      code: `import { Button } from './src/components/Button';\n`,
      filename: FILE_STANDALONE,
      settings: WILDCARD_SETTINGS,
      errors: [{ messageId: 'preferAlias' }],
      output: `import { Button } from '@/components/Button';\n`,
    },
    // Relative import from the alias root to a top-level folder should use alias
    {
      code: `import { Button } from './components/Button';\n`,
      filename: FILE_INDEX,
      settings: WILDCARD_SETTINGS,
      errors: [{ messageId: 'preferAlias' }],
      output: `import { Button } from '@/components/Button';\n`,
    },
    // Relative import across top-level alias folders should use alias
    {
      code: `import { helper } from '../utils/helper';\n`,
      filename: FILE_BUTTON,
      settings: WILDCARD_SETTINGS,
      errors: [{ messageId: 'preferAlias' }],
      output: `import { helper } from '@/utils/helper';\n`,
    },
    // Alias import should be relative when within the same top-level alias folder
    {
      code: `import { Label } from '@/components/internal/Label';\n`,
      filename: FILE_BUTTON,
      settings: WILDCARD_SETTINGS,
      errors: [{ messageId: 'preferRelative' }],
      output: `import { Label } from './internal/Label';\n`,
    },
    // Alias import from subdirectory to parent within the same top-level alias folder should be relative
    {
      code: `import { Button } from '@/components/Button';\n`,
      filename: FILE_LABEL,
      settings: WILDCARD_SETTINGS,
      errors: [{ messageId: 'preferRelative' }],
      output: `import { Button } from '../Button';\n`,
    },
    // Relative import from outside alias scope — fixed alias
    {
      code: `import { standalone } from '../standalone';\n`,
      filename: FILE_INDEX,
      settings: WILDCARD_AND_FIXED_SETTINGS,
      errors: [{ messageId: 'preferAlias' }],
      output: `import { standalone } from '@standalone';\n`,
    },
  ],
});

// =============================================================================
// mode: 'relative-if-local' with minSharedPathDepth: 0
// =============================================================================

ruleTester.run(
  'prefer-alias-imports (relative-if-local, minSharedPathDepth: 0)',
  preferAliasImports,
  {
    valid: [
      // Relative import from the alias root is allowed when any shared alias root is enough
      {
        code: `import { Button } from './components/Button';\n`,
        filename: FILE_INDEX,
        settings: WILDCARD_SETTINGS,
        options: [{ mode: 'relative-if-local', minSharedPathDepth: 0 }],
      },
      // Relative import across top-level alias folders is allowed when any shared alias root is enough
      {
        code: `import { helper } from '../utils/helper';\n`,
        filename: FILE_BUTTON,
        settings: WILDCARD_SETTINGS,
        options: [{ mode: 'relative-if-local', minSharedPathDepth: 0 }],
      },
    ],

    invalid: [
      // Alias import from the alias root should become relative when any shared alias root is enough
      {
        code: `import { Button } from '@/components/Button';\n`,
        filename: FILE_INDEX,
        settings: WILDCARD_SETTINGS,
        options: [{ mode: 'relative-if-local', minSharedPathDepth: 0 }],
        errors: [{ messageId: 'preferRelative' }],
        output: `import { Button } from './components/Button';\n`,
      },
      // Alias import across top-level alias folders should become relative when any shared alias root is enough
      {
        code: `import { helper } from '@/utils/helper';\n`,
        filename: FILE_BUTTON,
        settings: WILDCARD_SETTINGS,
        options: [{ mode: 'relative-if-local', minSharedPathDepth: 0 }],
        errors: [{ messageId: 'preferRelative' }],
        output: `import { helper } from '../utils/helper';\n`,
      },
    ],
  }
);
