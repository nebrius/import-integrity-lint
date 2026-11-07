import { join } from 'node:path';

import { getAllPackageSettings } from '../../settings.js';

const TEST_PACKAGE_DIR = join(import.meta.dirname, 'project');
const FILE_A = join(TEST_PACKAGE_DIR, 'src', 'a.ts');

// src-gen/ is outside the tsconfig rootDir src/, even though its name starts
// with "src", so an alias into it is dropped like any other alias outside
// rootDir
it('Ignores tsconfig paths into a sibling of rootDir that shares its name prefix', () => {
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
  expect(packageSettings.wildcardAliases).toEqual({
    '@/': join(TEST_PACKAGE_DIR, 'src/'),
  });
});
