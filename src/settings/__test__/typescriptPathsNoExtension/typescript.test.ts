import { join, sep } from 'node:path';

import type { ParsedPackageSettings } from '../../settings.js';
import { getAllPackageSettings } from '../../settings.js';

const TEST_PACKAGE_DIR = join(import.meta.dirname, 'project');
const FILE_A = join(TEST_PACKAGE_DIR, 'src', 'a.ts');
const FILE_DIR_INDEX = join(TEST_PACKAGE_DIR, 'src', 'dir', 'index.ts');

// Regression: tsconfig `paths` entries that omit the file extension (the
// standard TypeScript convention, e.g. `"@a": ["src/a"]` referring to
// `src/a.ts`) and entries that point to a directory containing an `index.ts`
// must resolve to a real code file. Previously this case threw and crashed
// the rule outright.
it('Resolves tsconfig paths entries that omit extensions or use index files', () => {
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
    wildcardAliases: {
      '@subdir/': join(TEST_PACKAGE_DIR, 'src', 'sub' + sep),
    },
    fixedAliases: {
      '@a': FILE_A,
      '@dir': FILE_DIR_INDEX,
    },
  };
  expect(packageSettings).toEqual(expected);
});
