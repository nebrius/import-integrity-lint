import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { RuleTester } from '@typescript-eslint/rule-tester';

import { noUnusedExports } from '../rule.js';

const TEST_PACKAGE_DIR = join(import.meta.dirname, 'project');
const FILE_A = join(TEST_PACKAGE_DIR, 'a.ts');
const FILE_B = join(TEST_PACKAGE_DIR, 'b.ts');
const FILE_D_DTS = join(TEST_PACKAGE_DIR, 'd.d.ts');
const FILE_E = join(TEST_PACKAGE_DIR, 'e.ts');
// g through o are each consumed only through a barrel of some kind by h.ts;
// q.ts is a barrel nothing imports through.
const FILE_G = join(TEST_PACKAGE_DIR, 'g.ts');
const FILE_I = join(TEST_PACKAGE_DIR, 'i.ts');
const FILE_K = join(TEST_PACKAGE_DIR, 'k.ts');
const FILE_M = join(TEST_PACKAGE_DIR, 'm.ts');
const FILE_O = join(TEST_PACKAGE_DIR, 'o.ts');
const FILE_Q = join(TEST_PACKAGE_DIR, 'q.ts');

const ruleTester = new RuleTester({
  languageOptions: {
    parserOptions: {
      projectService: {
        allowDefaultProject: ['*.ts*', '__fixture__/*.ts*', '__test__/*.ts*'],
        // Each case lints a different fixture file so the barrel shapes stay
        // isolated; the tester's default cap of 8 distinct files is a
        // performance heuristic for real projects, not a limit that matters
        // for a fixture this small.
        maximumDefaultProjectFileMatchCount_THIS_WILL_SLOW_DOWN_LINTING: 32,
      },
      tsconfigRootDir: TEST_PACKAGE_DIR,
    },
  },
});

ruleTester.run('no-unused-exports', noUnusedExports, {
  valid: [
    {
      code: `export const a1 = 10;
export const a2 = 10;
`,
      filename: FILE_A,
      settings: {
        'import-integrity': {
          packageRootDir: TEST_PACKAGE_DIR,
          mode: 'fix',
        },
      },
    },
    {
      code: `export function a1(arg: number): void;
export function a1(arg: string): void;
export function a1(arg: number | string): void {
  console.log(arg);
}
`,
      filename: FILE_A,
      settings: {
        'import-integrity': {
          packageRootDir: TEST_PACKAGE_DIR,
          mode: 'fix',
        },
      },
    },
    {
      code: readFileSync(FILE_B, 'utf8'),
      filename: FILE_B,
      settings: {
        'import-integrity': {
          packageRootDir: TEST_PACKAGE_DIR,
          mode: 'fix',
          entryPointFiles: { '.': './f.ts' },
        },
      },
    },
    {
      code: readFileSync(FILE_D_DTS, 'utf8'),
      filename: FILE_D_DTS,
      settings: {
        'import-integrity': {
          packageRootDir: TEST_PACKAGE_DIR,
          mode: 'fix',
        },
      },
    },
    {
      code: readFileSync(FILE_E, 'utf8'),
      filename: FILE_E,
      settings: {
        'import-integrity': {
          packageRootDir: TEST_PACKAGE_DIR,
          mode: 'fix',
          entryPointFiles: { '.': './e.ts' },
        },
      },
    },
    // g.ts is only reached through h.ts's `import * as g from './g'`
    {
      code: readFileSync(FILE_G, 'utf8'),
      filename: FILE_G,
      settings: {
        'import-integrity': {
          packageRootDir: TEST_PACKAGE_DIR,
          mode: 'fix',
        },
      },
    },
    // i.ts is `export * from './i-impl'`; h.ts imports iFn through it
    {
      code: readFileSync(FILE_I, 'utf8'),
      filename: FILE_I,
      settings: {
        'import-integrity': {
          packageRootDir: TEST_PACKAGE_DIR,
          mode: 'fix',
        },
      },
    },
    // k.ts re-exports a builtin; h.ts imports it through k.ts
    {
      code: readFileSync(FILE_K, 'utf8'),
      filename: FILE_K,
      settings: {
        'import-integrity': {
          packageRootDir: TEST_PACKAGE_DIR,
          mode: 'fix',
        },
      },
    },
    // m.ts is `export * as nodePath from 'node:path'`; h.ts imports nodePath
    {
      code: readFileSync(FILE_M, 'utf8'),
      filename: FILE_M,
      settings: {
        'import-integrity': {
          packageRootDir: TEST_PACKAGE_DIR,
          mode: 'fix',
        },
      },
    },
    // o.ts is only reached through h.ts's dynamic `import('./o')`
    {
      code: readFileSync(FILE_O, 'utf8'),
      filename: FILE_O,
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
      code: `export const a1 = 10;
    export const a2 = 10;
    // This one is not imported, thus a lint error
    export default 10;
    `,
      filename: FILE_A,
      errors: [{ messageId: 'noUnusedExports' }],
      settings: {
        'import-integrity': {
          packageRootDir: TEST_PACKAGE_DIR,
          mode: 'fix',
        },
      },
    },
    // q.ts is `export * from './g'` and nothing imports through it. Barrel
    // re-exports are only "used" when something actually passes through them.
    {
      code: readFileSync(FILE_Q, 'utf8'),
      filename: FILE_Q,
      errors: [{ messageId: 'noUnusedExports', data: { name: '<unnamed>' } }],
      settings: {
        'import-integrity': {
          packageRootDir: TEST_PACKAGE_DIR,
          mode: 'fix',
        },
      },
    },
  ],
});
