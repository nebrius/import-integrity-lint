import { join } from 'node:path';

import { jest } from '@jest/globals';

import { getAllPackageSettings } from '../../settings.js';

const TEST_PACKAGE_DIR = join(import.meta.dirname, 'project');
const FILE_A = join(TEST_PACKAGE_DIR, 'src', 'a.ts');

// ./dist-cjs/ is not inside the outDir ./dist, even though its name starts
// with "dist", so it isn't mapped back to source
it('Warns about an export in a sibling of outDir that shares its name prefix', () => {
  const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

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

  expect(packageSettings.entryPoints).toEqual([]);
  expect(warnSpy).toHaveBeenCalledTimes(1);
  expect(warnSpy.mock.calls[0][0]).toContain(
    "doesn't start with TypeScript's outDir ./dist"
  );

  warnSpy.mockRestore();
});
