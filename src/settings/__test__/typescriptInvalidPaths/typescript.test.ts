import { join } from 'node:path';

import { jest } from '@jest/globals';

import type { ParsedPackageSettings } from '../../settings.js';
import { getAllPackageSettings } from '../../settings.js';

const TEST_PACKAGE_DIR = join(import.meta.dirname, 'project');
const FILE_A = join(TEST_PACKAGE_DIR, 'src', 'a.ts');

// Regression: a single tsconfig `paths` entry pointing at a non-existent
// location must not bring down the whole rule. Other valid aliases in the
// same `paths` block should still be recorded; the invalid ones are warned
// about and skipped (matching how other tsconfig issues in the same parser
// are handled).
it('Skips tsconfig paths entries that do not resolve to anything on disk', () => {
  const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

  // The implementation must not throw even though `@missing` and `@missing/*`
  // resolve to nothing on disk.
  const { packageSettings } = getAllPackageSettings({
    filename: FILE_A,
    settings: {
      'import-integrity': {
        mode: 'one-shot',
        packageRootDir: TEST_PACKAGE_DIR,
      },
    },
  });

  if (!packageSettings) {
    throw new Error('packageSettings should be defined');
  }

  // Entry points / externally imported are populated with internal defaults;
  // override them so the test focuses on alias resolution.
  packageSettings.entryPoints = [];
  packageSettings.externallyImported = [];

  const expected: ParsedPackageSettings = {
    repoRootDir: TEST_PACKAGE_DIR,
    packageRootDir: TEST_PACKAGE_DIR,
    packageName: undefined,
    entryPoints: [],
    externallyImported: [],
    ignorePatterns: [],
    ignoreOverridePatterns: [],
    defaultIgnoreOverrides: [],
    testFilePatterns: [],
    wildcardAliases: {},
    fixedAliases: {
      '@valid': FILE_A,
    },
  };
  expect(packageSettings).toEqual(expected);

  // Both invalid entries should have produced a warning.
  const warnings = warnSpy.mock.calls.map(([msg]) => msg as string);
  expect(
    warnings.some((m) => m.includes('@missing') && !m.includes('@missing/'))
  ).toBe(true);
  expect(warnings.some((m) => m.includes('@missing/'))).toBe(true);

  warnSpy.mockRestore();
});
