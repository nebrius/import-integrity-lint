import { join } from 'node:path';

import { getTypeScriptSettings } from '../../typescript.js';

const TEST_PACKAGE_DIR = join(import.meta.dirname, 'project');

it('Returns undefined mapping when only one of rootDir/outDir is set', () => {
  const result = getTypeScriptSettings(TEST_PACKAGE_DIR, []);

  expect(result.mapping).toBeUndefined();
});
