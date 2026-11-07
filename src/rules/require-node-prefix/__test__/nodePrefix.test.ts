import { join } from 'node:path';

import { RuleTester } from '@typescript-eslint/rule-tester';

import { requireNodePrefix } from '../rule.js';

const TEST_PACKAGE_DIR = join(import.meta.dirname, 'project');
const FILE_A = join(TEST_PACKAGE_DIR, 'a.ts');

const ruleTester = new RuleTester({
  languageOptions: {
    parserOptions: {
      projectService: {
        allowDefaultProject: ['*.ts*'],
      },
      tsconfigRootDir: TEST_PACKAGE_DIR,
    },
  },
});

ruleTester.run('require-node-prefix', requireNodePrefix, {
  valid: [
    {
      code: `import fs from 'node:fs';`,
      filename: FILE_A,
      settings: {
        'import-integrity': {
          packageRootDir: TEST_PACKAGE_DIR,
          mode: 'fix',
        },
      },
    },
    // A dynamic import with a non-literal specifier can't be checked, even
    // when the variable happens to hold a builtin name.
    {
      code: `const target = 'fs';\nvoid import(target);`,
      filename: FILE_A,
      settings: {
        'import-integrity': {
          packageRootDir: TEST_PACKAGE_DIR,
          mode: 'fix',
        },
      },
    },
  ],

  invalid: [
    {
      code: `import fs from 'fs';`,
      filename: FILE_A,
      errors: [{ messageId: 'missingNodePrefix' }],
      settings: {
        'import-integrity': {
          packageRootDir: TEST_PACKAGE_DIR,
          mode: 'fix',
        },
      },
      output: `import fs from 'node:fs';`,
    },
    {
      // Make sure quote style is retained
      code: `import fs from "fs";`,
      filename: FILE_A,
      errors: [{ messageId: 'missingNodePrefix' }],
      settings: {
        'import-integrity': {
          packageRootDir: TEST_PACKAGE_DIR,
          mode: 'fix',
        },
      },
      output: `import fs from "node:fs";`,
    },
    {
      code: `import 'fs';`,
      filename: FILE_A,
      errors: [{ messageId: 'missingNodePrefix' }],
      settings: {
        'import-integrity': {
          packageRootDir: TEST_PACKAGE_DIR,
          mode: 'fix',
        },
      },
      output: `import 'node:fs';`,
    },
  ],
});
