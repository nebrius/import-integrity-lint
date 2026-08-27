import { join } from 'node:path';

import type { ParsedPackageSettings } from '../../settings.js';
import { getAllPackageSettings } from '../../settings.js';

const TEST_PACKAGE_DIR = join(import.meta.dirname, 'project');
const FILE_A = join(TEST_PACKAGE_DIR, 'src', 'a.ts');

it('Fetches settings from tsconfig with package path extends', () => {
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

  // This contains the default entry point setting, which is an internal
  // representation that's difficult to represent here, so we just override it
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
    wildcardAliases: {
      '@pkg/': join(TEST_PACKAGE_DIR, 'src/'),
    },
    fixedAliases: {},
  };
  expect(packageSettings).toEqual(expected);
});
