import { join } from 'node:path';

import { RuleTester } from '@typescript-eslint/rule-tester';

import { _testOnlyResetPackageInfo } from '../../../module/module.js';
import { _testOnlyResetAllSettings } from '../../../settings/settings.js';
import { noRestrictedImports } from '../rule.js';

const TEST_PACKAGE_DIR = join(import.meta.dirname, 'project');
const FILE_A = join(TEST_PACKAGE_DIR, 'a.ts');
const FILE_D = join(TEST_PACKAGE_DIR, 'd/d.ts');
const FILE_E2 = join(TEST_PACKAGE_DIR, 'e/e2.ts');
const FILE_DOTX_G = join(TEST_PACKAGE_DIR, 'dotXdir/g.ts');

const ruleTester = new RuleTester({
  languageOptions: {
    parserOptions: {
      projectService: {
        allowDefaultProject: ['*.ts*', 'd/*.ts*', 'e/*.ts*', 'dotXdir/*.ts*'],
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
    // The { regex } form, for configs serialized to JSON
    {
      code: `import { b } from './b';\nimport { fs } from 'node:fs';`,
      filename: FILE_A,
      settings: {
        'import-integrity': { packageRootDir: TEST_PACKAGE_DIR, mode: 'fix' },
      },
      options: [
        {
          rules: [
            {
              type: 'first-party',
              filepath: { regex: 'b\\.ts$' },
              allowed: [{ regex: 'a\\.ts$' }],
            },
            {
              type: 'third-party',
              moduleSpecifier: { regex: '^node:' },
              allowed: [{ regex: 'a\\.ts$' }],
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
              filepath: { regex: '(.+?)\\/[a-zA-Z0-9-_]+\\.ts$' },
              allowed: [{ regex: '$1\\/[a-zA-Z0-9-_]+\\.ts$' }],
            },
          ],
        },
      ],
    },
    // A capture group that didn't take part in the match is substituted as the
    // empty string, not the text "undefined"
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
              filepath: /(\/nomatch)?\/e\/e1\.ts$/,
              allowed: [/$1\/e\/e2\.ts$/],
            },
          ],
        },
      ],
    },
    // $10 refers to the tenth group, not the first followed by a 0
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
              filepath: /(.)(.)(.)(.)(.)(.)(.)(.)(.)(\/e)\/e1\.ts$/,
              allowed: [/$10\/e2\.ts$/],
            },
          ],
        },
      ],
    },
  ],
  invalid: [
    // Flags on the { regex } form apply
    {
      code: `import { b } from './b';`,
      filename: FILE_A,
      errors: [
        {
          messageId: 'restrictedImport',
          data: { message: `${FILE_A} is not allowed to import ./b` },
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
              filepath: { regex: 'B\\.TS$', flags: 'i' },
              allowed: [{ regex: 'C\\.TS$', flags: 'i' }],
            },
          ],
        },
      ],
    },
    {
      code: `import { fs } from 'node:fs';`,
      filename: FILE_A,
      errors: [
        {
          messageId: 'restrictedImport',
          data: { message: `${FILE_A} is denied from importing node:fs` },
        },
      ],
      settings: {
        'import-integrity': { packageRootDir: TEST_PACKAGE_DIR, mode: 'fix' },
      },
      options: [
        {
          rules: [
            {
              type: 'third-party',
              moduleSpecifier: { regex: '^node:' },
              denied: [{ regex: 'a\\.ts$' }],
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
              filepath: { regex: '(.+?)\\/[a-zA-Z0-9-_]+\\.ts$' },
              allowed: [{ regex: '$1\\/[a-zA-Z0-9-_]+\\.ts$' }],
            },
          ],
        },
      ],
    },
    // Captured text is matched literally: the "." in dot.dir must not match
    // the "X" in dotXdir
    {
      code: `import { f } from '../dot.dir/f';`,
      filename: FILE_DOTX_G,
      errors: [
        {
          messageId: 'restrictedImport',
          data: {
            message: `${FILE_DOTX_G} is not allowed to import ../dot.dir/f`,
          },
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
              filepath: /\/(dot[^/]*)\/f\.ts$/,
              allowed: [/\/$1\/[a-z]+\.ts$/],
            },
          ],
        },
      ],
    },
    // An escaped \$1 is a literal dollar sign and 1, not a reference
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
              filepath: /(e)\/e1\.ts$/,
              allowed: [/\$1|e2\.ts$/],
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
