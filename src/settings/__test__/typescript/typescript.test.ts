import { join } from 'node:path';

import type { ParsedPackageSettings } from '../../settings.js';
import { getAllPackageSettings } from '../../settings.js';

const TEST_PACKAGE_DIR = join(import.meta.dirname, 'project');
const FILE_A = join(TEST_PACKAGE_DIR, 'src', 'a.ts');

it('Fetchings settings from typescript', () => {
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
      '@/': join(TEST_PACKAGE_DIR, 'src/'),
    },
    fixedAliases: {
      '@a': FILE_A,
    },
  };
  expect(packageSettings).toEqual(expected);
});
