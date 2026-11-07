import { join } from 'node:path';

import { RuleTester } from '@typescript-eslint/rule-tester';

import { noUnresolvedImports } from '../rule.js';

// project/package-lock.json is load-bearing: @manypkg uses it to detect this
// fixture as an npm-workspaces monorepo.
const MONOREPO_ROOT_DIR = join(import.meta.dirname, 'project');
const TEST_PACKAGE_DIR = join(MONOREPO_ROOT_DIR, 'packages', 'one');
const FILE_A = join(TEST_PACKAGE_DIR, 'a.ts');
const FILE_D = join(MONOREPO_ROOT_DIR, 'packages', 'two', 'd.ts');
// vendor/ has its own package.json listing `vendor-only`. vendor-extra/ is a
// sibling whose name starts with "vendor", and has no package.json of its own.
const FILE_VENDOR = join(TEST_PACKAGE_DIR, 'vendor', 'v.ts');
const FILE_VENDOR_EXTRA = join(TEST_PACKAGE_DIR, 'vendor-extra', 'v.ts');

const ruleTester = new RuleTester({
  languageOptions: {
    parserOptions: {
      projectService: {
        allowDefaultProject: ['*.ts*', '../two/*.ts*', 'vendor*/*.ts'],
      },
      tsconfigRootDir: TEST_PACKAGE_DIR,
    },
  },
});

ruleTester.run('no-unresolved-exports', noUnresolvedImports, {
  valid: [
    {
      // A package.json nested inside the package applies to the files in its
      // directory
      code: `import { x } from 'vendor-only'`,
      filename: FILE_VENDOR,
      settings: {
        'import-integrity': {
          monorepoRootDir: MONOREPO_ROOT_DIR,
          mode: 'fix',
        },
      },
    },
    {
      code: `import * as b from './b'`,
      filename: FILE_A,
      settings: {
        'import-integrity': {
          monorepoRootDir: MONOREPO_ROOT_DIR,
          mode: 'fix',
        },
      },
    },
    {
      code: `import * as tf from 'type-fest'`,
      filename: FILE_A,
      settings: {
        'import-integrity': {
          monorepoRootDir: MONOREPO_ROOT_DIR,
          mode: 'fix',
        },
      },
    },
    {
      code: `import type { JSX } from 'react'`,
      filename: FILE_A,
      settings: {
        'import-integrity': {
          monorepoRootDir: MONOREPO_ROOT_DIR,
          mode: 'fix',
        },
      },
    },
    // Only @types/react is listed, which is enough for a type-only namespace
    // import just as it is for a type-only named import
    {
      code: `import type * as React from 'react'`,
      filename: FILE_A,
      settings: {
        'import-integrity': {
          monorepoRootDir: MONOREPO_ROOT_DIR,
          mode: 'fix',
        },
      },
    },
    {
      code: `export * from 'type-fest'`,
      filename: FILE_A,
      settings: {
        'import-integrity': {
          monorepoRootDir: MONOREPO_ROOT_DIR,
          mode: 'fix',
        },
      },
    },
    {
      // packages/two is still a known workspace package even without its own
      // import-integrity.config.json. With no module specifiers to resolve, this
      // file should stay quiet.
      code: `export const d = 10`,
      filename: FILE_D,
      settings: {
        'import-integrity': {
          monorepoRootDir: MONOREPO_ROOT_DIR,
          mode: 'fix',
        },
      },
    },
    {
      code: `import { foo } from '@test/two'`,
      filename: FILE_A,
      settings: {
        'import-integrity': {
          monorepoRootDir: MONOREPO_ROOT_DIR,
          mode: 'fix',
        },
      },
    },
    {
      code: `import x from 'https://example.com/mod.js'`,
      filename: FILE_A,
      settings: {
        'import-integrity': {
          monorepoRootDir: MONOREPO_ROOT_DIR,
          mode: 'fix',
        },
      },
    },
    {
      code: `import x from 'http://example.com/mod.js'`,
      filename: FILE_A,
      settings: {
        'import-integrity': {
          monorepoRootDir: MONOREPO_ROOT_DIR,
          mode: 'fix',
        },
      },
    },
    {
      code: `import 'https://example.com/polyfill.js'`,
      filename: FILE_A,
      settings: {
        'import-integrity': {
          monorepoRootDir: MONOREPO_ROOT_DIR,
          mode: 'fix',
        },
      },
    },
    {
      code: `async function load() { return await import('https://example.com/mod.js'); }`,
      filename: FILE_A,
      settings: {
        'import-integrity': {
          monorepoRootDir: MONOREPO_ROOT_DIR,
          mode: 'fix',
        },
      },
    },
    {
      code: `import * as x from 'https://example.com/mod.js'`,
      filename: FILE_A,
      settings: {
        'import-integrity': {
          monorepoRootDir: MONOREPO_ROOT_DIR,
          mode: 'fix',
        },
      },
    },
    {
      // e.ts is `export { default as data } from './data.json'`: a single
      // re-export whose target is a non-code file still resolves.
      code: `import { data } from './e'`,
      filename: FILE_A,
      settings: {
        'import-integrity': {
          monorepoRootDir: MONOREPO_ROOT_DIR,
          mode: 'fix',
        },
      },
    },
    {
      // A dynamic import with a non-literal specifier can't be checked
      // statically. It is recorded, but not reported.
      code: `const target = './b';
async function load() {
  return import(target);
}
console.log(load);`,
      filename: FILE_A,
      settings: {
        'import-integrity': {
          monorepoRootDir: MONOREPO_ROOT_DIR,
          mode: 'fix',
        },
      },
    },
    {
      // Namespace and dynamic imports of a non-code file resolve to that file,
      // and there is nothing inside a non-code file to check.
      code: `import * as data from './data.json';
async function load() {
  return import('./data.json');
}
console.log(data, load);`,
      filename: FILE_A,
      settings: {
        'import-integrity': {
          monorepoRootDir: MONOREPO_ROOT_DIR,
          mode: 'fix',
        },
      },
    },
    {
      code: `export * as data from './data.json'`,
      filename: FILE_A,
      settings: {
        'import-integrity': {
          monorepoRootDir: MONOREPO_ROOT_DIR,
          mode: 'fix',
        },
      },
    },
    {
      // A named or side effect import of a non-code file resolves to that
      // file. There is no symbol to check in a non-code file, so that is the
      // end of it.
      code: `import data from './data.json';
import './data.json';
console.log(data);`,
      filename: FILE_A,
      settings: {
        'import-integrity': {
          monorepoRootDir: MONOREPO_ROOT_DIR,
          mode: 'fix',
        },
      },
    },
    {
      // Whether a module specifier points at a file at all is left to
      // TypeScript and bundlers, which already report it for every one of
      // these shapes. The plugin only knows the files it analyzes, so it could
      // not tell a missing file from an ignored one such as build output.
      // These statements are recorded and never reported.
      code: `import { x } from './unknown';
import * as y from './unknown';
import './unknown';
async function load() {
  return import('./unknown');
}
console.log(x, y, load);`,
      filename: FILE_A,
      settings: {
        'import-integrity': {
          monorepoRootDir: MONOREPO_ROOT_DIR,
          mode: 'fix',
        },
      },
    },
    {
      code: `export { x } from './unknown';
export * from './unknown';`,
      filename: FILE_A,
      settings: {
        'import-integrity': {
          monorepoRootDir: MONOREPO_ROOT_DIR,
          mode: 'fix',
        },
      },
    },
    {
      // h.ts is `export { h } from './missing'`, i.ts is
      // `export * as i from './missing'`, and j.ts is
      // `export * from './missing'`. A file the plugin can't see is just as
      // unknowable one re-export away, so these aren't reported either.
      code: `import { h } from './h';
import { i } from './i';
import { j } from './j';
console.log(h, i, j);`,
      filename: FILE_A,
      settings: {
        'import-integrity': {
          monorepoRootDir: MONOREPO_ROOT_DIR,
          mode: 'fix',
        },
      },
    },
  ],

  invalid: [
    {
      code: `import { unknown } from './b'`,
      filename: FILE_A,
      errors: [{ messageId: 'noUnresolvedImports' }],
      settings: {
        'import-integrity': {
          monorepoRootDir: MONOREPO_ROOT_DIR,
          mode: 'fix',
        },
      },
    },
    {
      code: `export { SourceCode } from './c';`,
      filename: FILE_A,
      errors: [{ messageId: 'noUnresolvedImports' }],
      settings: {
        'import-integrity': {
          monorepoRootDir: MONOREPO_ROOT_DIR,
          mode: 'fix',
        },
      },
    },
    {
      code: `import React from 'react'`,
      filename: FILE_A,
      errors: [{ messageId: 'noTransientDependencies' }],
      settings: {
        'import-integrity': {
          monorepoRootDir: MONOREPO_ROOT_DIR,
          mode: 'fix',
        },
      },
    },
    {
      code: `import { unknown } from 'unknown'`,
      filename: FILE_A,
      errors: [{ messageId: 'noTransientDependencies' }],
      settings: {
        'import-integrity': {
          monorepoRootDir: MONOREPO_ROOT_DIR,
          mode: 'fix',
        },
      },
    },
    {
      // ...but not to a sibling directory whose name starts the same way
      code: `import { x } from 'vendor-only'`,
      filename: FILE_VENDOR_EXTRA,
      errors: [{ messageId: 'noTransientDependencies' }],
      settings: {
        'import-integrity': {
          monorepoRootDir: MONOREPO_ROOT_DIR,
          mode: 'fix',
        },
      },
    },
    {
      // packages/two is still linted even without a package-local config
      // file, so a third-party specifier missing from that workspace package's
      // package.json must still report.
      code: `import React from 'react'`,
      filename: FILE_D,
      errors: [{ messageId: 'noTransientDependencies' }],
      settings: {
        'import-integrity': {
          monorepoRootDir: MONOREPO_ROOT_DIR,
          mode: 'fix',
        },
      },
    },
    {
      // f.ts is `export * from './g'` and g.ts only has a default export.
      // `export *` never forwards `default`, so this cannot resolve.
      code: `import def from './f'`,
      filename: FILE_A,
      errors: [{ messageId: 'noUnresolvedImports' }],
      settings: {
        'import-integrity': {
          monorepoRootDir: MONOREPO_ROOT_DIR,
          mode: 'fix',
        },
      },
    },
    {
      // An empty specifier (what an editor leaves after auto-closing quotes)
      // is reported as such, not skipped and not called an unknown package.
      code: `import { x } from ''`,
      filename: FILE_A,
      errors: [{ messageId: 'emptyModuleSpecifier' }],
      settings: {
        'import-integrity': {
          monorepoRootDir: MONOREPO_ROOT_DIR,
          mode: 'fix',
        },
      },
    },
    {
      code: `export { x } from ''`,
      filename: FILE_A,
      errors: [{ messageId: 'emptyModuleSpecifier' }],
      settings: {
        'import-integrity': {
          monorepoRootDir: MONOREPO_ROOT_DIR,
          mode: 'fix',
        },
      },
    },
  ],
});
