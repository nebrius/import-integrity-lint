import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { RuleTester } from '@typescript-eslint/rule-tester';

import { noTestOnlyImports } from '../rule.js';

const TEST_PACKAGE_DIR = join(import.meta.dirname, 'project');
const FILE_A = join(TEST_PACKAGE_DIR, 'a.ts');
const FILE_B = join(TEST_PACKAGE_DIR, 'b.ts');
const FILE_C_TEST = join(TEST_PACKAGE_DIR, '__custom_test__', 'c-test.ts');
const FILE_D_DTS = join(TEST_PACKAGE_DIR, 'd.d.ts');
const FILE_E = join(TEST_PACKAGE_DIR, 'e.ts');
const FILE_G = join(TEST_PACKAGE_DIR, 'g.ts');
const FILE_H = join(TEST_PACKAGE_DIR, 'h.ts');
const FILE_STAR_IMPL = join(TEST_PACKAGE_DIR, 'star-impl.ts');
const FILE_NS_IMPL = join(TEST_PACKAGE_DIR, 'ns-impl.ts');
const FILE_BARREL_IMPL = join(TEST_PACKAGE_DIR, 'barrel-impl.ts');
const FILE_CHAIN_MID = join(TEST_PACKAGE_DIR, 'chain-mid.ts');
const FILE_CHAIN_IMPL = join(TEST_PACKAGE_DIR, 'chain-impl.ts');
const FILE_K = join(TEST_PACKAGE_DIR, 'k.ts');
const FILE_KSTAR = join(TEST_PACKAGE_DIR, 'kstar.ts');
const FILE_KNS = join(TEST_PACKAGE_DIR, 'kns.ts');
const FILE_M = join(TEST_PACKAGE_DIR, 'm.ts');

// The four barrel shapes from issue #48: production reaches each `*-impl`
// export only through an entry-point barrel re-export or an `import * as`,
// while a test imports it directly.
const BARREL_ENTRY_POINTS = {
  './star': './star.ts',
  './ns': './ns.ts',
  './named': './named.ts',
  './chain': './chain.ts',
};

const ruleTester = new RuleTester({
  languageOptions: {
    parserOptions: {
      projectService: {
        allowDefaultProject: [
          '*.ts*',
          '__custom_test__/*.ts*',
          '__test__/*.ts*',
          'test/*.ts*',
          'tests/*.ts*',
        ],
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

ruleTester.run('no-test-only-imports', noTestOnlyImports, {
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
    // __custom_test__ is added to testFilePatterns, so c-test.ts is a test file
    // and its exports only being used by other test files is valid
    {
      code: readFileSync(FILE_C_TEST, 'utf8'),
      filename: FILE_C_TEST,
      settings: {
        'import-integrity': {
          packageRootDir: TEST_PACKAGE_DIR,
          mode: 'fix',
          testFilePatterns: ['__custom_test__'],
        },
      },
    },
    // g.ts exports a type that is only imported by a test file. Type exports
    // are exempt from this rule, so this is valid.
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
    // h.ts exports two `_testOnly`-prefixed values: one only imported by a test
    // file, one not imported at all. Both are exempt from this rule because of
    // the prefix.
    {
      code: readFileSync(FILE_H, 'utf8'),
      filename: FILE_H,
      settings: {
        'import-integrity': {
          packageRootDir: TEST_PACKAGE_DIR,
          mode: 'fix',
        },
      },
    },
    // star.ts (entry point) does `export * from './star-impl'`
    {
      code: readFileSync(FILE_STAR_IMPL, 'utf8'),
      filename: FILE_STAR_IMPL,
      settings: {
        'import-integrity': {
          packageRootDir: TEST_PACKAGE_DIR,
          mode: 'fix',
          entryPointFiles: BARREL_ENTRY_POINTS,
        },
      },
    },
    // ns.ts (entry point) does `export * as ns from './ns-impl'`
    {
      code: readFileSync(FILE_NS_IMPL, 'utf8'),
      filename: FILE_NS_IMPL,
      settings: {
        'import-integrity': {
          packageRootDir: TEST_PACKAGE_DIR,
          mode: 'fix',
          entryPointFiles: BARREL_ENTRY_POINTS,
        },
      },
    },
    // consumer.ts (production) does `import * as b from './barrel-impl'`
    {
      code: readFileSync(FILE_BARREL_IMPL, 'utf8'),
      filename: FILE_BARREL_IMPL,
      settings: {
        'import-integrity': {
          packageRootDir: TEST_PACKAGE_DIR,
          mode: 'fix',
          entryPointFiles: BARREL_ENTRY_POINTS,
        },
      },
    },
    // chain.ts (entry point) does `export * from './chain-mid'`, which lands
    // on chain-mid's `export { chainFn } from './chain-impl'`
    {
      code: readFileSync(FILE_CHAIN_MID, 'utf8'),
      filename: FILE_CHAIN_MID,
      settings: {
        'import-integrity': {
          packageRootDir: TEST_PACKAGE_DIR,
          mode: 'fix',
          entryPointFiles: BARREL_ENTRY_POINTS,
        },
      },
    },
    // k.ts re-exports a type that is only imported by a test file. Type
    // re-exports are exempt just like type exports.
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
    // kstar.ts (`export type *`) and kns.ts (`export type * as`) are only
    // imported through by a test file. Type barrel re-exports are exempt too.
    ...[FILE_KSTAR, FILE_KNS].map((filename) => ({
      code: readFileSync(filename, 'utf8'),
      filename,
      settings: {
        'import-integrity': {
          packageRootDir: TEST_PACKAGE_DIR,
          mode: 'fix',
        },
      },
    })),
  ],

  invalid: [
    {
      code: `export const a1 = 10;
    export const a2 = 10;
    // This one is only imported in tests, thus a lint error
    export const a3 = 10;
    `,
      filename: FILE_A,
      errors: [{ messageId: 'noTestOnlyImports' }],
      settings: {
        'import-integrity': {
          packageRootDir: TEST_PACKAGE_DIR,
          mode: 'fix',
        },
      },
    },
    // __custom_test__ is NOT in testFilePatterns, so c-test.ts is a prod file
    // and its exports only being used by test files is an error
    {
      code: readFileSync(FILE_C_TEST, 'utf8'),
      filename: FILE_C_TEST,
      errors: [{ messageId: 'noTestOnlyImports' }],
      settings: {
        'import-integrity': {
          packageRootDir: TEST_PACKAGE_DIR,
          mode: 'fix',
        },
      },
    },
    // a5 is only imported by test/i-test.ts. The `/test/` default pattern
    // means that file is treated as a test file, so a5 is a test-only export.
    {
      code: `export const a1 = 10;
export const a2 = 10;
export const a5 = 10;
`,
      filename: FILE_A,
      errors: [{ messageId: 'noTestOnlyImports' }],
      settings: {
        'import-integrity': {
          packageRootDir: TEST_PACKAGE_DIR,
          mode: 'fix',
        },
      },
    },
    // a6 is only imported by tests/j-test.ts. The `/tests/` default pattern
    // (plural) means that file is treated as a test file, so a6 is a
    // test-only export.
    {
      code: `export const a1 = 10;
export const a2 = 10;
export const a6 = 10;
`,
      filename: FILE_A,
      errors: [{ messageId: 'noTestOnlyImports' }],
      settings: {
        'import-integrity': {
          packageRootDir: TEST_PACKAGE_DIR,
          mode: 'fix',
        },
      },
    },
    // chain-impl.ts: chainFn is reached by production through the chain.ts
    // barrel, but chainOther is not re-exported by chain-mid.ts, so the
    // production barrel never exposes it. Only the test imports it. Barrel
    // reachability must be tracked by name, not by whole file, or this would
    // be missed.
    {
      code: readFileSync(FILE_CHAIN_IMPL, 'utf8'),
      filename: FILE_CHAIN_IMPL,
      errors: [
        { messageId: 'noTestOnlyImports', data: { name: 'chainOther' } },
      ],
      settings: {
        'import-integrity': {
          packageRootDir: TEST_PACKAGE_DIR,
          mode: 'fix',
          entryPointFiles: BARREL_ENTRY_POINTS,
        },
      },
    },
    // m.ts is reached only by a test file's `import * as m`. A namespace
    // import from a test is still a test-only import.
    {
      code: readFileSync(FILE_M, 'utf8'),
      filename: FILE_M,
      errors: [{ messageId: 'noTestOnlyImports', data: { name: 'mFn' } }],
      settings: {
        'import-integrity': {
          packageRootDir: TEST_PACKAGE_DIR,
          mode: 'fix',
        },
      },
    },
  ],
});
