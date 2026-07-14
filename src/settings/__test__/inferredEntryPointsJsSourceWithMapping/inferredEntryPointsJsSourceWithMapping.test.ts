import { join } from 'node:path';

import { jest } from '@jest/globals';

import { getAllPackageSettings } from '../../settings.js';

const TEST_PACKAGE_DIR = join(import.meta.dirname, 'project');
const FILE_INDEX = join(TEST_PACKAGE_DIR, 'src', 'index.ts');

it('Infers exports pointing at existing files outside outDir directly, alongside mapped compiled exports', () => {
  const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

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

  expect(packageSettings.entryPoints).toEqual([
    // Compiled export under outDir → mapped back to source
    { type: 'static', subPath: '.', filePath: './src/index.ts' },
    // Export outside outDir that exists on disk as-is → used directly,
    // without the outDir-mismatch warning
    { type: 'static', subPath: './cli', filePath: './bin/cli.js' },
  ]);
  expect(warnSpy).not.toHaveBeenCalled();

  warnSpy.mockRestore();
});
