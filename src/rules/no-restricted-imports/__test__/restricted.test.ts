import { join } from 'node:path';

import { RuleTester } from '@typescript-eslint/rule-tester';

import { _testOnlyResetPackageInfo } from '../../../module/module.js';
import { _testOnlyResetAllSettings } from '../../../settings/settings.js';
import { noRestrictedImports } from '../rule.js';

const TEST_PACKAGE_DIR = join(import.meta.dirname, 'project');
const FILE_A = join(TEST_PACKAGE_DIR, 'a.ts');
const FILE_D = join(TEST_PACKAGE_DIR, 'd/d.ts');
const FILE_E2 = join(TEST_PACKAGE_DIR, 'e/e2.ts');

const ruleTester = new RuleTester({
  languageOptions: {
    parserOptions: {
      projectService: {
        allowDefaultProject: ['*.ts*', 'd/*.ts*', 'e/*.ts*'],
      },
      tsconfigRootDir: TEST_PACKAGE_DIR,
    },
  },
});

beforeEach(() => {
  _testOnlyResetAllSettings();
  _testOnlyResetPackageInfo();
});

ruleTester.run('no-restricted-imports', noRestrictedImports, {
  valid: [
    // A dynamic import with a non-literal specifier can't be matched against
    // any restriction, even one that would catch the literal form.
    {
      code: `const target = './b';\nvoid import(target);`,
      filename: FILE_A,
      settings: {
        'import-integrity': { packageRootDir: TEST_PACKAGE_DIR, mode: 'fix' },
      },
      options: [
        {
          rules: [
            {
              type: 'first-party',
              filepath: './b.ts',
              allowed: ['./c.ts'],
            },
          ],
        },
      ],
    },
    {
      code: `import { b } from './b';\nimport { c } from './c';\nimport { fs } from 'node:fs';`,
      filename: FILE_A,
      settings: {
        'import-integrity': { packageRootDir: TEST_PACKAGE_DIR, mode: 'fix' },
      },
      options: [
        {
          rules: [
            {
              type: 'first-party',
              filepath: './b.ts',
              allowed: ['./a.ts', './c.ts'],
            },
            {
              type: 'third-party',
              moduleSpecifier: 'node:fs',
              allowed: ['./a.ts', './c.ts'],
            },
          ],
        },
      ],
    },
    {
      code: `import { b } from './b';\nimport { c } from './c';\nimport { fs } from 'node:fs';`,
      filename: FILE_A,
      settings: {
        'import-integrity': { packageRootDir: TEST_PACKAGE_DIR, mode: 'fix' },
      },
      options: [
        {
          rules: [
            {
              type: 'first-party',
              filepath: /b.ts$/,
              allowed: [/a.ts$/, /c.ts$/],
            },
            {
              type: 'third-party',
              moduleSpecifier: /^node:*/,
              allowed: [/a.ts$/, /c.ts$/],
            },
          ],
        },
      ],
    },
    {
      code: `import { b } from './b';\nimport { c } from './c';\nimport { fs } from 'node:fs';`,
      filename: FILE_A,
      settings: {
        'import-integrity': { packageRootDir: TEST_PACKAGE_DIR, mode: 'fix' },
      },
      options: [
        {
          rules: [
            {
              type: 'first-party',
              filepath: './b.ts',
              denied: ['./b.ts', './c.ts'],
            },
            {
              type: 'third-party',
              moduleSpecifier: 'node:fs',
              denied: ['./b.ts', './c.ts'],
            },
          ],
        },
      ],
    },
    {
      code: `import { b } from './b';\nimport { c } from './c';\nimport { fs } from 'node:fs';`,
      filename: FILE_A,
      settings: {
        'import-integrity': { packageRootDir: TEST_PACKAGE_DIR, mode: 'fix' },
      },
      options: [
        {
          rules: [
            {
              type: 'first-party',
              filepath: /b.ts$/,
              denied: [/b.ts$/, /c.ts$/],
            },
            {
              type: 'third-party',
              moduleSpecifier: /^node:*/,
              denied: [/b.ts$/, /c.ts$/],
            },
          ],
        },
      ],
    },
    {
      code: `import { b } from './b';\nimport { c } from './c';\nimport { fs } from 'node:fs';`,
      filename: FILE_A,
      settings: {
        'import-integrity': { packageRootDir: TEST_PACKAGE_DIR, mode: 'fix' },
      },
      options: [
        {
          rules: [
            {
              type: 'first-party',
              filepath: /b.ts$/,
              denied: [/b.ts$/, /c.ts$/],
            },
            {
              type: 'third-party',
              moduleSpecifier: /^node:*/,
              denied: [/b.ts$/, /c.ts$/],
            },
          ],
        },
      ],
    },
    {
      code: `import { e1 } from './e1';`,
      filename: FILE_E2,
      settings: {
        'import-integrity': { packageRootDir: TEST_PACKAGE_DIR, mode: 'fix' },
      },
      options: [
        {
          rules: [
            {
              type: 'first-party',
              filepath: /(.+?)\/[a-zA-Z0-9-_]+\.ts$/,
              allowed: [/$1\/[a-zA-Z0-9-_]+\.ts$/],
            },
          ],
        },
      ],
    },
    {
      code: `import { e1 } from './e1';`,
      filename: FILE_E2,
      settings: {
        'import-integrity': { packageRootDir: TEST_PACKAGE_DIR, mode: 'fix' },
      },
      options: [
        {
          rules: [
            {
              type: 'first-party',
              filepath: /(.+?)\/[a-zA-Z0-9-_]+\.ts$/,
              denied: [/d\/[a-zA-Z0-9-_]+\.ts$/],
            },
          ],
        },
      ],
    },
    {
      code: `import type { e1 } from '../e/e1';`,
      filename: FILE_D,
      settings: {
        'import-integrity': { packageRootDir: TEST_PACKAGE_DIR, mode: 'fix' },
      },
      options: [
        {
          rules: [
            {
              type: 'first-party',
              filepath: /(.+?)\/[a-zA-Z0-9-_]+\.ts$/,
              allowed: [/$1\/[a-zA-Z0-9-_]+\.ts$/],
              excludeTypeImports: true,
            },
          ],
        },
      ],
    },
    // The exclusion covers every type-only statement, not just named imports
    {
      code: `import type * as e1ns from '../e/e1';
export type { e1 } from '../e/e1';
export type * from '../e/e1';
export type * as e1star from '../e/e1';`,
      filename: FILE_D,
      settings: {
        'import-integrity': { packageRootDir: TEST_PACKAGE_DIR, mode: 'fix' },
      },
      options: [
        {
          rules: [
            {
              type: 'first-party',
              filepath: /(.+?)\/[a-zA-Z0-9-_]+\.ts$/,
              allowed: [/$1\/[a-zA-Z0-9-_]+\.ts$/],
              excludeTypeImports: true,
            },
          ],
        },
      ],
    },
  ],
  invalid: [
    {
      code: `import { b } from './b';\nimport { c } from './c';\nimport { fs } from 'node:fs';`,
      filename: FILE_A,
      errors: [
        {
          messageId: 'restrictedImport',
          data: { message: `${FILE_A} is denied from importing ./b` },
        },
        {
          messageId: 'restrictedImport',
          data: { message: `${FILE_A} is denied from importing node:fs` },
        },
      ],
      settings: {
        'import-integrity': {
          packageRootDir: TEST_PACKAGE_DIR,
          mode: 'fix',
        },
      },
      options: [
        {
          rules: [
            {
              type: 'first-party',
              filepath: './b.ts',
              denied: ['./a.ts', './c.ts'],
            },
            {
              type: 'third-party',
              moduleSpecifier: 'node:fs',
              denied: ['./a.ts', './c.ts'],
            },
          ],
        },
      ],
    },
    {
      code: `import { b } from './b';\nimport { c } from './c';\nimport { fs } from 'node:fs';`,
      filename: FILE_A,
      errors: [
        {
          messageId: 'restrictedImport',
          data: { message: `${FILE_A} is denied from importing ./b` },
        },
        {
          messageId: 'restrictedImport',
          data: { message: `${FILE_A} is denied from importing node:fs` },
        },
      ],
      settings: {
        'import-integrity': {
          packageRootDir: TEST_PACKAGE_DIR,
          mode: 'fix',
        },
      },
      options: [
        {
          rules: [
            {
              type: 'first-party',
              filepath: /b.ts$/,
              denied: [/a.ts$/, /c.ts$/],
            },
            {
              type: 'third-party',
              moduleSpecifier: /^node:*/,
              denied: [/a.ts$/, /c.ts$/],
            },
          ],
        },
      ],
    },
    {
      code: `import { b } from './b';\nimport { c } from './c';\nimport { fs } from 'node:fs';`,
      filename: FILE_A,
      errors: [
        {
          messageId: 'restrictedImport',
          data: { message: `${FILE_A} is not allowed to import ./b` },
        },
        {
          messageId: 'restrictedImport',
          data: { message: `${FILE_A} is not allowed to import node:fs` },
        },
      ],
      settings: {
        'import-integrity': {
          packageRootDir: TEST_PACKAGE_DIR,
          mode: 'fix',
        },
      },
      options: [
        {
          rules: [
            {
              type: 'first-party',
              filepath: './b.ts',
              allowed: ['./b.ts', './c.ts'],
            },
            {
              type: 'third-party',
              moduleSpecifier: 'node:fs',
              allowed: ['./b.ts', './c.ts'],
            },
          ],
        },
      ],
    },
    {
      code: `import { b } from './b';\nimport { c } from './c';\nimport { fs } from 'node:fs';`,
      filename: FILE_A,
      errors: [
        {
          messageId: 'restrictedImport',
          data: { message: `${FILE_A} is not allowed to import ./b` },
        },
        {
          messageId: 'restrictedImport',
          data: { message: `${FILE_A} is not allowed to import node:fs` },
        },
      ],
      settings: {
        'import-integrity': {
          packageRootDir: TEST_PACKAGE_DIR,
          mode: 'fix',
        },
      },
      options: [
        {
          rules: [
            {
              type: 'first-party',
              filepath: /b.ts$/,
              allowed: [/b.ts$/, /c.ts$/],
            },
            {
              type: 'third-party',
              moduleSpecifier: /^node:*/,
              allowed: [/b.ts$/, /c.ts$/],
            },
          ],
        },
      ],
    },
    {
      code: `import { e1 } from '../e/e1';`,
      filename: FILE_D,
      errors: [
        {
          messageId: 'restrictedImport',
          data: { message: `${FILE_D} is not allowed to import ../e/e1` },
        },
      ],
      settings: {
        'import-integrity': { packageRootDir: TEST_PACKAGE_DIR, mode: 'fix' },
      },
      options: [
        {
          rules: [
            {
              type: 'first-party',
              filepath: /(.+?)\/[a-zA-Z0-9-_]+\.ts$/,
              allowed: [/$1\/[a-zA-Z0-9-_]+\.ts$/],
            },
          ],
        },
      ],
    },
    {
      code: `import { e1 } from '../e/e1';`,
      filename: FILE_D,
      errors: [
        {
          messageId: 'restrictedImport',
          data: { message: `${FILE_D} is denied from importing ../e/e1` },
        },
      ],
      settings: {
        'import-integrity': { packageRootDir: TEST_PACKAGE_DIR, mode: 'fix' },
      },
      options: [
        {
          rules: [
            {
              type: 'first-party',
              filepath: /(.+?)\/[a-zA-Z0-9-_]+\.ts$/,
              denied: [/d\/[a-zA-Z0-9-_]+\.ts$/],
            },
          ],
        },
      ],
    },
    {
      code: `import './b';`,
      filename: FILE_A,
      errors: [
        {
          messageId: 'restrictedImport',
          data: { message: `${FILE_A} is denied from importing ./b` },
        },
      ],
      settings: {
        'import-integrity': { packageRootDir: TEST_PACKAGE_DIR, mode: 'fix' },
      },
      options: [
        {
          rules: [
            {
              type: 'first-party',
              filepath: './b.ts',
              denied: ['./a.ts'],
            },
          ],
        },
      ],
    },
  ],
});
