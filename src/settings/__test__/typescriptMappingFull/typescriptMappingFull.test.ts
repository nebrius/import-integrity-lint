import { join } from 'node:path';

import { getTypeScriptSettings } from '../../typescript.js';

const TEST_PACKAGE_DIR = join(import.meta.dirname, 'project');

it('Returns mapping with normalized rootDir and outDir when both are set', () => {
  const result = getTypeScriptSettings(TEST_PACKAGE_DIR, []);

  // rootDir: "src" (bare) is normalized to "./src"; outDir: "./dist" is kept as-is
  expect(result.mapping).toEqual({
    rootDir: './src',
    outDir: './dist',
  });
});
