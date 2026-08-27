import { existsSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { parse } from '@typescript-eslint/typescript-estree';

import type { StrippedAnalyzedFileDetails } from '../../../__test__/util.js';
import type { ParsedPackageSettings } from '../../../settings/settings.js';
import {
  getPackageInfo,
  initializePackage,
  updateCacheForFile,
  updateCacheFromFileSystem,
} from '../../module.js';

const TEST_PACKAGE_DIR = join(import.meta.dirname, 'project', 'singlerepo');
const FILE_A = join(TEST_PACKAGE_DIR, 'a.ts');
const FILE_B = join(TEST_PACKAGE_DIR, 'b.ts');
const FILE_TS_NEW = join(TEST_PACKAGE_DIR, 'new.ts');
const FILE_JSON_NEW = join(TEST_PACKAGE_DIR, 'new.json');

const packageSettings: ParsedPackageSettings = {
  repoRootDir: TEST_PACKAGE_DIR,
  packageRootDir: TEST_PACKAGE_DIR,
  packageName: 'singlerepo',
  wildcardAliases: {},
  fixedAliases: {},
  entryPoints: [],
  externallyImported: [],
  ignorePatterns: [],
  ignoreOverridePatterns: [],
  defaultIgnoreOverrides: [],
  testFilePatterns: [],
};

const EXPECTED_FILE_A: StrippedAnalyzedFileDetails = {
  fileType: 'code',
  entryPointSpecifier: undefined,
  isExternallyImported: false,
  singleImports: [],
  barrelImports: [],
  dynamicImports: [],
  sideEffectImports: [],
  exports: [
    {
      type: 'export',
      exportName: 'One',
      isTypeExport: true,
      importedBy: [
        {
          filePath: FILE_B,
          importEntry: {
            type: 'singleImport',
            importAlias: 'One',
            importName: 'One',
            isTypeImport: true,
            moduleSpecifier: './a',
            resolvedModuleType: 'firstPartyCode',
            resolvedModulePath: FILE_A,
            rootModuleType: 'firstPartyCode',
            rootModulePath: FILE_A,
          },
        },
      ],
      barrelImportedBy: [],
      externallyImportedBy: [],
      isEntryPoint: false,
      isExternallyImported: false,
    },
  ],
  singleReexports: [],
  barrelReexports: [],
};

const EXPECTED_FILE_B: StrippedAnalyzedFileDetails = {
  fileType: 'code',
  entryPointSpecifier: undefined,
  isExternallyImported: false,
  singleImports: [
    {
      type: 'singleImport',
      importAlias: 'One',
      importName: 'One',
      isTypeImport: true,
      moduleSpecifier: './a',
      resolvedModuleType: 'firstPartyCode',
      resolvedModulePath: FILE_A,
      rootModuleType: 'firstPartyCode',
      rootModulePath: FILE_A,
      rootExportEntry: {
        type: 'export',
        exportName: 'One',
        isTypeExport: true,
        isEntryPoint: false,
        isExternallyImported: false,
      },
    },
  ],
  barrelImports: [],
  dynamicImports: [],
  sideEffectImports: [],
  exports: [],
  singleReexports: [],
  barrelReexports: [],
};

const EXPECTED = {
  [FILE_A]: EXPECTED_FILE_A,
  [FILE_B]: EXPECTED_FILE_B,
};

afterEach(() => {
  if (existsSync(FILE_TS_NEW)) {
    unlinkSync(FILE_TS_NEW);
  }
  if (existsSync(FILE_JSON_NEW)) {
    unlinkSync(FILE_JSON_NEW);
  }
});

it('Updates package cache when a new file is added', () => {
  initializePackage(packageSettings);

  let packageInfo = getPackageInfo(TEST_PACKAGE_DIR);
  expect(packageInfo).toMatchAnalyzedSpec(EXPECTED);

  updateCacheForFile({
    filePath: FILE_TS_NEW,
    fileContents: '',
    ast: parse('', {
      loc: true,
      range: true,
      tokens: true,
      jsx: true,
    }),
    packageSettings,
  });

  const EXPECTED_FILE_TS_NEW: StrippedAnalyzedFileDetails = {
    fileType: 'code',
    entryPointSpecifier: undefined,
    isExternallyImported: false,
    singleImports: [],
    barrelImports: [],
    dynamicImports: [],
    sideEffectImports: [],
    exports: [],
    singleReexports: [],
    barrelReexports: [],
  };

  packageInfo = getPackageInfo(TEST_PACKAGE_DIR);
  expect(packageInfo).toMatchAnalyzedSpec({
    [FILE_A]: EXPECTED_FILE_A,
    [FILE_B]: EXPECTED_FILE_B,
    [FILE_TS_NEW]: EXPECTED_FILE_TS_NEW,
  });
});

it('Updates package cache when an unused export is added to an existing file', () => {
  initializePackage(packageSettings);

  let packageInfo = getPackageInfo(TEST_PACKAGE_DIR);
  expect(packageInfo).toMatchAnalyzedSpec(EXPECTED);

  const FILE_A_UPDATED_CONTENTS = `export type One = string;
export type Two = string;
`;

  updateCacheForFile({
    filePath: FILE_A,
    fileContents: FILE_A_UPDATED_CONTENTS,
    ast: parse(FILE_A_UPDATED_CONTENTS, {
      loc: true,
      range: true,
      tokens: true,
      jsx: true,
    }),
    packageSettings,
  });

  packageInfo = getPackageInfo(TEST_PACKAGE_DIR);

  const EXPECTED_FILE_A_UPDATED: StrippedAnalyzedFileDetails = {
    fileType: 'code',
    entryPointSpecifier: undefined,
    isExternallyImported: false,
    singleImports: [],
    barrelImports: [],
    dynamicImports: [],
    sideEffectImports: [],
    exports: [
      {
        type: 'export',
        exportName: 'One',
        isTypeExport: true,
        importedBy: [
          {
            filePath: FILE_B,
            importEntry: {
              type: 'singleImport',
              importAlias: 'One',
              importName: 'One',
              isTypeImport: true,
              moduleSpecifier: './a',
              resolvedModuleType: 'firstPartyCode',
              resolvedModulePath: FILE_A,
              rootModuleType: 'firstPartyCode',
              rootModulePath: FILE_A,
            },
          },
        ],
        barrelImportedBy: [],
        externallyImportedBy: [],
        isEntryPoint: false,
        isExternallyImported: false,
      },
      {
        type: 'export',
        exportName: 'Two',
        isTypeExport: true,
        importedBy: [],
        barrelImportedBy: [],
        externallyImportedBy: [],
        isEntryPoint: false,
        isExternallyImported: false,
      },
    ],
    singleReexports: [],
    barrelReexports: [],
  };
  const EXPECTED_FILE_B_UPDATED: StrippedAnalyzedFileDetails = {
    fileType: 'code',
    entryPointSpecifier: undefined,
    isExternallyImported: false,
    singleImports: [
      {
        type: 'singleImport',
        importAlias: 'One',
        importName: 'One',
        isTypeImport: true,
        moduleSpecifier: './a',
        resolvedModuleType: 'firstPartyCode',
        resolvedModulePath: FILE_A,
        rootModulePath: FILE_A,
        rootModuleType: 'firstPartyCode',
        rootExportEntry: {
          type: 'export',
          exportName: 'One',
          isTypeExport: true,
          isEntryPoint: false,
          isExternallyImported: false,
        },
      },
    ],
    barrelImports: [],
    dynamicImports: [],
    sideEffectImports: [],
    exports: [],
    singleReexports: [],
    barrelReexports: [],
  };
  expect(packageInfo).toMatchAnalyzedSpec({
    [FILE_A]: EXPECTED_FILE_A_UPDATED,
    [FILE_B]: EXPECTED_FILE_B_UPDATED,
  });
});

it('Updates package cache in bulk for a code file', () => {
  initializePackage(packageSettings);

  let packageInfo = getPackageInfo(TEST_PACKAGE_DIR);
  expect(packageInfo).toMatchAnalyzedSpec(EXPECTED);

  // Add a new file
  writeFileSync(FILE_TS_NEW, '');
  updateCacheFromFileSystem({
    repoRootDir: packageSettings.repoRootDir,
    packageRootDir: packageSettings.packageRootDir,
    changes: {
      added: [
        {
          filePath: FILE_TS_NEW,
          latestUpdatedAt: Date.now(),
        },
      ],
      modified: [],
      deleted: [],
    },
    packageJsons: [],
    packageSettings,
    operationStart: Date.now(),
  });
  const EXPECTED_FILE_TS_NEW: StrippedAnalyzedFileDetails = {
    fileType: 'code',
    entryPointSpecifier: undefined,
    isExternallyImported: false,
    singleImports: [],
    barrelImports: [],
    dynamicImports: [],
    sideEffectImports: [],
    exports: [],
    singleReexports: [],
    barrelReexports: [],
  };
  packageInfo = getPackageInfo(TEST_PACKAGE_DIR);
  expect(packageInfo).toMatchAnalyzedSpec({
    [FILE_A]: EXPECTED_FILE_A,
    [FILE_B]: EXPECTED_FILE_B,
    [FILE_TS_NEW]: EXPECTED_FILE_TS_NEW,
  });

  // Modify the new new file
  writeFileSync(FILE_TS_NEW, `console.log()`);
  updateCacheFromFileSystem({
    repoRootDir: packageSettings.repoRootDir,
    packageRootDir: packageSettings.packageRootDir,
    changes: {
      added: [],
      modified: [
        {
          filePath: FILE_TS_NEW,
          latestUpdatedAt: Date.now(),
        },
      ],
      deleted: [],
    },
    packageJsons: [],
    packageSettings,
    operationStart: Date.now(),
  });
  const EXPECTED_FILE_TS_NEW_UPDATED: StrippedAnalyzedFileDetails = {
    fileType: 'code',
    entryPointSpecifier: undefined,
    isExternallyImported: false,
    singleImports: [],
    barrelImports: [],
    dynamicImports: [],
    sideEffectImports: [],
    exports: [],
    singleReexports: [],
    barrelReexports: [],
  };
  packageInfo = getPackageInfo(TEST_PACKAGE_DIR);
  expect(packageInfo).toMatchAnalyzedSpec({
    [FILE_A]: EXPECTED_FILE_A,
    [FILE_B]: EXPECTED_FILE_B,
    [FILE_TS_NEW]: EXPECTED_FILE_TS_NEW_UPDATED,
  });

  // Modify the new file with invalid code (testing fallback to ensure package
  // info isn't changed in any way)
  writeFileSync(FILE_TS_NEW, `+_)(*&^%$%)`);
  updateCacheFromFileSystem({
    repoRootDir: packageSettings.repoRootDir,
    packageRootDir: packageSettings.packageRootDir,
    changes: {
      added: [],
      modified: [
        {
          filePath: FILE_TS_NEW,
          latestUpdatedAt: Date.now(),
        },
      ],
      deleted: [],
    },
    packageJsons: [],
    packageSettings,
    operationStart: Date.now(),
  });
  packageInfo = getPackageInfo(TEST_PACKAGE_DIR);
  expect(packageInfo).toMatchAnalyzedSpec({
    [FILE_A]: EXPECTED_FILE_A,
    [FILE_B]: EXPECTED_FILE_B,
    [FILE_TS_NEW]: EXPECTED_FILE_TS_NEW_UPDATED,
  });

  // Delete the file
  unlinkSync(FILE_TS_NEW);
  updateCacheFromFileSystem({
    repoRootDir: packageSettings.repoRootDir,
    packageRootDir: packageSettings.packageRootDir,
    changes: {
      added: [],
      modified: [],
      deleted: [FILE_TS_NEW],
    },
    packageJsons: [],
    packageSettings,
    operationStart: Date.now(),
  });
  packageInfo = getPackageInfo(TEST_PACKAGE_DIR);
  expect(packageInfo).toMatchAnalyzedSpec(EXPECTED);
});

it('Updates package cache in bulk for a non-code file', () => {
  initializePackage(packageSettings);

  let packageInfo = getPackageInfo(TEST_PACKAGE_DIR);
  expect(packageInfo).toMatchAnalyzedSpec(EXPECTED);

  // Add a new file
  writeFileSync(FILE_JSON_NEW, '{}');
  updateCacheFromFileSystem({
    repoRootDir: packageSettings.repoRootDir,
    packageRootDir: packageSettings.packageRootDir,
    changes: {
      added: [
        {
          filePath: FILE_JSON_NEW,
          latestUpdatedAt: Date.now(),
        },
      ],
      modified: [],
      deleted: [],
    },
    packageJsons: [],
    packageSettings,
    operationStart: Date.now(),
  });
  const EXPECTED_FILE_JSON_NEW: StrippedAnalyzedFileDetails = {
    fileType: 'other',
  };
  packageInfo = getPackageInfo(TEST_PACKAGE_DIR);
  expect(packageInfo).toMatchAnalyzedSpec({
    [FILE_A]: EXPECTED_FILE_A,
    [FILE_B]: EXPECTED_FILE_B,
    [FILE_JSON_NEW]: EXPECTED_FILE_JSON_NEW,
  });

  // Modify the new new file
  writeFileSync(FILE_JSON_NEW, `{ "foo": 10 }`);
  updateCacheFromFileSystem({
    repoRootDir: packageSettings.repoRootDir,
    packageRootDir: packageSettings.packageRootDir,
    changes: {
      added: [],
      modified: [
        {
          filePath: FILE_JSON_NEW,
          latestUpdatedAt: Date.now(),
        },
      ],
      deleted: [],
    },
    packageJsons: [],
    packageSettings,
    operationStart: Date.now(),
  });
  const EXPECTED_FILE_JSON_NEW_UPDATED: StrippedAnalyzedFileDetails = {
    fileType: 'other',
  };
  packageInfo = getPackageInfo(TEST_PACKAGE_DIR);
  expect(packageInfo).toMatchAnalyzedSpec({
    [FILE_A]: EXPECTED_FILE_A,
    [FILE_B]: EXPECTED_FILE_B,
    [FILE_JSON_NEW]: EXPECTED_FILE_JSON_NEW_UPDATED,
  });

  // Delete the file
  unlinkSync(FILE_JSON_NEW);
  updateCacheFromFileSystem({
    repoRootDir: packageSettings.repoRootDir,
    packageRootDir: packageSettings.packageRootDir,
    changes: {
      added: [],
      modified: [],
      deleted: [FILE_JSON_NEW],
    },
    packageJsons: [],
    packageSettings,
    operationStart: Date.now(),
  });
  packageInfo = getPackageInfo(TEST_PACKAGE_DIR);
  expect(packageInfo).toMatchAnalyzedSpec(EXPECTED);
});
