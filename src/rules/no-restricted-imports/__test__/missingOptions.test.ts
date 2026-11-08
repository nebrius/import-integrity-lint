import { join } from 'node:path';

import type { ESLint } from 'eslint';
import { Linter } from 'eslint';

import { noRestrictedImports } from '../rule.js';

const TEST_PACKAGE_DIR = join(import.meta.dirname, 'project');
const FILE_A = join(TEST_PACKAGE_DIR, 'a.ts');

// ESLint's rule types and typescript-eslint's don't line up, though the rule
// is the same object at runtime
const plugin = {
  rules: { 'no-restricted-imports': noRestrictedImports },
} as unknown as ESLint.Plugin;

// The rule restricts nothing without options, so enabling it without any is a
// configuration mistake, never a silent no-op.

it('Fails ESLint config validation when enabled without options', () => {
  const linter = new Linter({ configType: 'flat' });
  expect(() =>
    linter.verify(
      'export {};',
      [
        {
          files: ['**/*.ts'],
          plugins: { 'import-integrity': plugin },
          rules: { 'import-integrity/no-restricted-imports': 'error' },
          settings: {
            'import-integrity': { packageRootDir: TEST_PACKAGE_DIR },
          },
        },
      ],
      FILE_A
    )
  ).toThrow(/should NOT have fewer than 1 items/);
});

// Validation against the schema can't be relied on alone: ESLint 9 has been
// seen running rules whose options fail it, and Oxlint may not check it. So the
// rule also checks for itself.
it('Exits with a configuration error when its options are missing at runtime', () => {
  const context = {
    options: [],
    filename: FILE_A,
    settings: { 'import-integrity': { packageRootDir: TEST_PACKAGE_DIR } },
  } as unknown as Parameters<typeof noRestrictedImports.create>[0];
  expect(() => noRestrictedImports.create(context)).toThrow(
    'Rule import-integrity/no-restricted-imports was enabled without options'
  );
});
