import { join } from 'node:path';

import { getAllPackageSettings } from '../../settings.js';

const TEST_PACKAGE_DIR = join(import.meta.dirname, 'project');
const FILE_INDEX = join(TEST_PACKAGE_DIR, 'src', 'index.js');

it('Infers entry points from exports that point directly at an existing file, without a tsconfig mapping', () => {
  const { packageSettings } = getAllPackageSettings({
    filename: FILE_INDEX,
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

  // Pure-JS package: no tsconfig, exports reference the source file as-is
  expect(packageSettings.entryPoints).toEqual([
    { type: 'static', subPath: '.', filePath: './src/index.js' },
  ]);
});
