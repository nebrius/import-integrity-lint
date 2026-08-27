import { join } from 'node:path';

import { parse } from '@typescript-eslint/typescript-estree';

import type { ParsedPackageSettings } from '../../../settings/settings.js';
import {
  getPackageInfo,
  initializePackage,
  updateCacheForFile,
} from '../../module.js';

function parseContents(contents: string) {
  return parse(contents, {
    loc: true,
    range: true,
    tokens: true,
    jsx: true,
  });
}

const SINGLEREPO_DIR = join(import.meta.dirname, 'project');
const SINGLEREPO_FILE_A = join(SINGLEREPO_DIR, 'a.ts');

it('Updates cache when a new file is added', () => {
  const settings: ParsedPackageSettings = {
    repoRootDir: SINGLEREPO_DIR,
    packageRootDir: SINGLEREPO_DIR,
    packageName: 'test',
    wildcardAliases: {},
    fixedAliases: {},
    entryPoints: [],
    externallyImported: [],
    ignorePatterns: [],
    ignoreOverridePatterns: [],
    defaultIgnoreOverrides: [],
    testFilePatterns: [],
  };
  initializePackage(settings);

  let packageInfo = getPackageInfo(SINGLEREPO_DIR);
  // a.ts on disk contains intentionally invalid syntax; it must be skipped
  // during startup and must not leak into packageInfo.files. This guards
  // against a past regression where a parse failure on startup would crash
  // the plugin or leave a half-populated entry behind.
  expect(packageInfo.files.has(SINGLEREPO_FILE_A)).toBe(false);
  expect(packageInfo.files.size).toBe(0);
  expect(packageInfo).toMatchAnalyzedSpec({});

  updateCacheForFile({
    filePath: SINGLEREPO_FILE_A,
    fileContents: 'export const a = 10;',
    ast: parseContents('export const a = 10;'),
    packageSettings: settings,
  });

  packageInfo = getPackageInfo(SINGLEREPO_DIR);
  expect(packageInfo).toMatchAnalyzedSpec({
    [SINGLEREPO_FILE_A]: {
      fileType: 'code',
      entryPointSpecifier: undefined,
      isExternallyImported: false,
      singleImports: [],
      barrelImports: [],
      dynamicImports: [],
      sideEffectImports: [],
      singleReexports: [],
      barrelReexports: [],
      exports: [
        {
          type: 'export',
          barrelImportedBy: [],
          exportName: 'a',
          importedBy: [],
          externallyImportedBy: [],
          isEntryPoint: false,
          isExternallyImported: false,
          isTypeExport: false,
        },
      ],
    },
  });
});
