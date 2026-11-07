import { join } from 'node:path';

import { RuleTester } from '@typescript-eslint/rule-tester';

import { _testOnlyResetPackageInfo } from '../../../module/module.js';
import { _testOnlyResetAllSettings } from '../../../settings/settings.js';
import { noTestImportsInProd } from '../rule.js';

const TEST_PACKAGE_DIR = join(import.meta.dirname, 'project');
const FILE_A = join(TEST_PACKAGE_DIR, 'a.ts');
const FILE_TEST_Z = join(TEST_PACKAGE_DIR, '__test__', 'z.ts');

const ruleTester = new RuleTester({
  languageOptions: {
    parserOptions: {
      projectService: {
        allowDefaultProject: ['*.ts*', '__test__/*.ts*'],
      },
      tsconfigRootDir: TEST_PACKAGE_DIR,
    },
  },
});

beforeEach(() => {
  _testOnlyResetAllSettings();
  _testOnlyResetPackageInfo();
});

ruleTester.run('no-test-imports-in-prod', noTestImportsInProd, {
  valid: [
    {
      code: ``,
      filename: FILE_A,
      settings: {
        'import-integrity': {
          packageRootDir: TEST_PACKAGE_DIR,
          mode: 'fix',
        },
      },
    },
    // testing/e.ts lives in a directory whose name contains "test" but is
    // neither `test/` nor `tests/`. The default patterns are anchored, so it
    // is treated as a production file and importing it from production code
    // is allowed.
    {
      code: `import { eHelper } from './testing/e';

console.log(eHelper);
`,
      filename: FILE_A,
      settings: {
        'import-integrity': {
          packageRootDir: TEST_PACKAGE_DIR,
          mode: 'fix',
        },
      },
    },
    // h.ts has both a production export and a `_testOnly` export. Importing
    // the production symbol by name is fine. Builtin and third party imports
    // are never checked.
    {
      code: `import { join } from 'node:path';
import { prodThing } from './h';

console.log(join, prodThing);
`,
      filename: FILE_A,
      settings: {
        'import-integrity': {
          packageRootDir: TEST_PACKAGE_DIR,
          mode: 'fix',
        },
      },
    },
    // Test files may reach `_testOnly` exports any way they like.
    {
      code: `import * as h from '../h';

console.log(h);
`,
      filename: FILE_TEST_Z,
      settings: {
        'import-integrity': {
          packageRootDir: TEST_PACKAGE_DIR,
          mode: 'fix',
        },
      },
    },
    // A production barrel that is not an entry point is not reported on its
    // own: an import through it is reported at the import site, and a barrel
    // nothing imports through is no-unused-exports' concern.
    {
      code: `export * from './h';
`,
      filename: FILE_A,
      settings: {
        'import-integrity': {
          packageRootDir: TEST_PACKAGE_DIR,
          mode: 'fix',
        },
      },
    },
    // Type-only statements are erased at compile time, so they expose nothing
    // at runtime, whatever they can reach: a namespace with a `_testOnly`
    // member, an `export * as` namespace, or a renamed `_testOnly` export.
    {
      code: `import type * as h from './h';
import type { ns } from './barrel';
import type { ns2 } from './renamed';
`,
      filename: FILE_A,
      settings: {
        'import-integrity': {
          packageRootDir: TEST_PACKAGE_DIR,
          mode: 'fix',
        },
      },
    },
    // The same holds for an entry point's type-only re-exports.
    {
      code: `export type * from './h';
export type * as ns from './h';
export type { ns2 } from './renamed';
`,
      filename: FILE_A,
      settings: {
        'import-integrity': {
          packageRootDir: TEST_PACKAGE_DIR,
          entryPointFiles: { '.': './a.ts' },
          mode: 'fix',
        },
      },
    },
  ],
  invalid: [
    {
      code: `import { bTest } from './__test__/b';

console.log(bTest);
`,
      filename: FILE_A,
      errors: [{ messageId: 'noTestImports' }],
      settings: {
        'import-integrity': {
          packageRootDir: TEST_PACKAGE_DIR,
          mode: 'fix',
        },
      },
    },
    // c.ts is a production file that exposes a `_testOnly`-prefixed export.
    // A production caller importing it should be flagged even though the
    // resolved file is not itself a test file.
    {
      code: `import { _testOnlyHelper } from './c';

console.log(_testOnlyHelper);
`,
      filename: FILE_A,
      errors: [{ messageId: 'noTestImports' }],
      settings: {
        'import-integrity': {
          packageRootDir: TEST_PACKAGE_DIR,
          mode: 'fix',
        },
      },
    },
    {
      code: `import './__test__/b';\n`,
      filename: FILE_A,
      errors: [{ messageId: 'noTestImports' }],
      settings: {
        'import-integrity': {
          packageRootDir: TEST_PACKAGE_DIR,
          mode: 'fix',
        },
      },
    },
    // test/b.ts is recognized as a test file via the `/test/` default pattern.
    {
      code: `import { bTest } from './test/b';

console.log(bTest);
`,
      filename: FILE_A,
      errors: [{ messageId: 'noTestImports' }],
      settings: {
        'import-integrity': {
          packageRootDir: TEST_PACKAGE_DIR,
          mode: 'fix',
        },
      },
    },
    // tests/d.ts is recognized as a test file via the `/tests/` default
    // pattern (plural).
    {
      code: `import { dTest } from './tests/d';

console.log(dTest);
`,
      filename: FILE_A,
      errors: [{ messageId: 'noTestImports' }],
      settings: {
        'import-integrity': {
          packageRootDir: TEST_PACKAGE_DIR,
          mode: 'fix',
        },
      },
    },
    // A namespace import of a module with a `_testOnly` export exposes that
    // export to production code, even though nothing names it.
    {
      code: `import * as h from './h';

console.log(h);
`,
      filename: FILE_A,
      errors: [{ messageId: 'noTestOnlyReach', data: { name: '_testOnlyH' } }],
      settings: {
        'import-integrity': {
          packageRootDir: TEST_PACKAGE_DIR,
          mode: 'fix',
        },
      },
    },
    // Same for a dynamic import, which also yields the whole namespace.
    {
      code: `async function load() {
  return import('./h');
}

console.log(load);
`,
      filename: FILE_A,
      errors: [{ messageId: 'noTestOnlyReach', data: { name: '_testOnlyH' } }],
      settings: {
        'import-integrity': {
          packageRootDir: TEST_PACKAGE_DIR,
          mode: 'fix',
        },
      },
    },
    // barrel.ts is `export * as ns from './h'`: importing the namespace by
    // name reaches `ns._testOnlyH`.
    {
      code: `import { ns } from './barrel';

console.log(ns);
`,
      filename: FILE_A,
      errors: [{ messageId: 'noTestOnlyReach', data: { name: '_testOnlyH' } }],
      settings: {
        'import-integrity': {
          packageRootDir: TEST_PACKAGE_DIR,
          mode: 'fix',
        },
      },
    },
    // renamed.ts is `export { _testOnlyH as ns2 } from './h'`: the import
    // names `ns2`, but it resolves to a `_testOnly` export.
    {
      code: `import { ns2 } from './renamed';

console.log(ns2);
`,
      filename: FILE_A,
      errors: [{ messageId: 'noTestOnlyReach', data: { name: '_testOnlyH' } }],
      settings: {
        'import-integrity': {
          packageRootDir: TEST_PACKAGE_DIR,
          mode: 'fix',
        },
      },
    },
    // mocks.ts is `export * as _testOnlyMocks from './h'`: a `_testOnly`
    // namespace re-export is a `_testOnly` export like any other. The import
    // reaches both `_testOnlyMocks` and h.ts's `_testOnlyH`, and the report
    // names the smallest, whatever order the files are walked in.
    {
      code: `import * as mocks from './mocks';

console.log(mocks);
`,
      filename: FILE_A,
      errors: [
        {
          messageId: 'noTestOnlyReach',
          data: { name: '_testOnlyH' },
        },
      ],
      settings: {
        'import-integrity': {
          packageRootDir: TEST_PACKAGE_DIR,
          mode: 'fix',
        },
      },
    },
    // __test__/helpers.ts is a test file that also exposes a `_testOnly`
    // export. Importing it from production is one problem, reported once.
    {
      code: `import * as helpers from './__test__/helpers';

console.log(helpers);
`,
      filename: FILE_A,
      errors: [{ messageId: 'noTestImports' }],
      settings: {
        'import-integrity': {
          packageRootDir: TEST_PACKAGE_DIR,
          mode: 'fix',
        },
      },
    },
    // An entry point's re-exports are imports from outside the package. One
    // that reaches a `_testOnly` export exposes it to every consumer, whether
    // through `export *`, `export * as`, or a named re-export chain.
    {
      code: `export * from './h';
`,
      filename: FILE_A,
      errors: [
        { messageId: 'noTestOnlyReexport', data: { name: '_testOnlyH' } },
      ],
      settings: {
        'import-integrity': {
          packageRootDir: TEST_PACKAGE_DIR,
          entryPointFiles: { '.': './a.ts' },
          mode: 'fix',
        },
      },
    },
    {
      code: `export * as ns from './h';
`,
      filename: FILE_A,
      errors: [
        { messageId: 'noTestOnlyReexport', data: { name: '_testOnlyH' } },
      ],
      settings: {
        'import-integrity': {
          packageRootDir: TEST_PACKAGE_DIR,
          entryPointFiles: { '.': './a.ts' },
          mode: 'fix',
        },
      },
    },
    // renamed.ts is `export { _testOnlyH as ns2 } from './h'`: the chain ends
    // at a `_testOnly` export even though this statement names neither.
    {
      code: `export { ns2 } from './renamed';
`,
      filename: FILE_A,
      errors: [
        { messageId: 'noTestOnlyReexport', data: { name: '_testOnlyH' } },
      ],
      settings: {
        'import-integrity': {
          packageRootDir: TEST_PACKAGE_DIR,
          entryPointFiles: { '.': './a.ts' },
          mode: 'fix',
        },
      },
    },
  ],
});
