import { join } from 'node:path';

import type { StrippedResolvedFileDetails } from '../../../../__test__/util.js';
import {
  addBaseInfoForFile,
  computeBaseInfo,
  updateBaseInfoForFile,
} from '../../../computeBaseInfo.js';
import {
  addResolvedInfoForFile,
  computeFolderTree,
  computeResolvedInfo,
  deleteResolvedInfoForFile,
  updateResolvedInfoForFile,
} from '../../../computeResolvedInfo.js';

const TEST_PACKAGE_DIR = join(import.meta.dirname, 'project');
const NEW_FILE_PATH = join(TEST_PACKAGE_DIR, 'newFile.ts');
const FILE_INDEX = join(TEST_PACKAGE_DIR, 'index.ts');
const FILE_A = join(TEST_PACKAGE_DIR, 'a.ts');
const FILE_B = join(TEST_PACKAGE_DIR, 'one', 'b.ts');
const FILE_C = join(TEST_PACKAGE_DIR, 'one', 'c', 'index.ts');
const FILE_C_DATA = join(TEST_PACKAGE_DIR, 'one', 'c', 'data.json');
const FILE_D = join(TEST_PACKAGE_DIR, 'two', 'd.js');
const FILE_D_DECLARATION = join(TEST_PACKAGE_DIR, 'two', 'd.d.ts');
const FILE_E = join(TEST_PACKAGE_DIR, 'two', 'e.js');
const FILE_F = join(TEST_PACKAGE_DIR, 'two', 'f', 'index.js');
const FILE_F_DECLARATION = join(TEST_PACKAGE_DIR, 'two', 'f', 'index.d.ts');

const EXPECTED_FILE_A: StrippedResolvedFileDetails = {
  entryPointSpecifier: undefined,
  isExternallyImported: false,
  exports: [],
  fileType: 'code',
  singleImports: [
    {
      type: 'singleImport',
      importAlias: 'b1',
      importName: 'b1',
      isTypeImport: false,
      moduleSpecifier: '@/one/b',
      resolvedModuleType: 'firstPartyCode',
      resolvedModulePath: FILE_B,
    },
    {
      type: 'singleImport',
      importAlias: 'data',
      importName: 'default',
      isTypeImport: false,
      moduleSpecifier: './one/c/data',
      resolvedModuleType: 'firstPartyOther',
      resolvedModulePath: FILE_C_DATA,
    },
    {
      type: 'singleImport',
      importAlias: 'D2',
      importName: 'D2',
      isTypeImport: true,
      moduleSpecifier: './two/d',
      resolvedModuleType: 'firstPartyCode',
      resolvedModulePath: FILE_D_DECLARATION,
    },
    {
      type: 'singleImport',
      importAlias: 'getD1',
      importName: 'getD1',
      isTypeImport: false,
      moduleSpecifier: './two/d',
      resolvedModuleType: 'firstPartyCode',
      resolvedModulePath: FILE_D,
    },
    {
      type: 'singleImport',
      importAlias: 'e1',
      importName: 'e1',
      isTypeImport: false,
      moduleSpecifier: './two/e',
      resolvedModuleType: 'firstPartyCode',
      resolvedModulePath: FILE_E,
    },
    {
      type: 'singleImport',
      importAlias: 'F1',
      importName: 'F1',
      isTypeImport: true,
      moduleSpecifier: './two/f',
      resolvedModuleType: 'firstPartyCode',
      resolvedModulePath: FILE_F_DECLARATION,
    },
    {
      type: 'singleImport',
      importAlias: 'getF1',
      importName: 'getF1',
      isTypeImport: false,
      moduleSpecifier: './two/f',
      resolvedModuleType: 'firstPartyCode',
      resolvedModulePath: FILE_F,
    },
    {
      type: 'singleImport',
      importAlias: 'join',
      importName: 'join',
      isTypeImport: false,
      moduleSpecifier: 'path',
      resolvedModuleType: 'builtin',
    },
    {
      type: 'singleImport',
      importAlias: 'resolve',
      importName: 'resolve',
      isTypeImport: false,
      moduleSpecifier: 'node:path',
      resolvedModuleType: 'builtin',
    },
    {
      type: 'singleImport',
      importAlias: 'parser',
      importName: 'parser',
      isTypeImport: false,
      moduleSpecifier: 'typescript-eslint',
      resolvedModuleType: 'thirdParty',
    },
    {
      type: 'singleImport',
      importAlias: 'index',
      importName: 'index',
      isTypeImport: false,
      moduleSpecifier: '.',
      resolvedModuleType: 'firstPartyCode',
      resolvedModulePath: FILE_INDEX,
    },
    {
      type: 'singleImport',
      importAlias: 'b1',
      importName: 'b1',
      isTypeImport: false,
      moduleSpecifier: '@alias',
      resolvedModuleType: 'firstPartyCode',
      resolvedModulePath: FILE_B,
    },
  ],
  barrelImports: [],
  dynamicImports: [],
  sideEffectImports: [],
  singleReexports: [],
  barrelReexports: [],
};

const EXPECTED_FILE_INDEX: StrippedResolvedFileDetails = {
  entryPointSpecifier: undefined,
  isExternallyImported: false,
  exports: [
    {
      type: 'export',
      exportName: 'index',
      isEntryPoint: false,
      isExternallyImported: false,
      isTypeExport: false,
    },
  ],
  fileType: 'code',
  singleImports: [],
  barrelImports: [],
  dynamicImports: [],
  sideEffectImports: [],
  singleReexports: [],
  barrelReexports: [],
};

const EXPECTED_FILE_B: StrippedResolvedFileDetails = {
  entryPointSpecifier: undefined,
  isExternallyImported: false,
  exports: [
    {
      type: 'export',
      exportName: 'b1',
      isEntryPoint: false,
      isExternallyImported: false,
      isTypeExport: false,
    },
  ],
  fileType: 'code',
  singleImports: [],
  barrelImports: [],
  dynamicImports: [],
  sideEffectImports: [],
  singleReexports: [],
  barrelReexports: [],
};

const EXPECTED_FILE_C: StrippedResolvedFileDetails = {
  entryPointSpecifier: undefined,
  isExternallyImported: false,
  fileType: 'code',
  exports: [
    {
      type: 'export',
      exportName: 'c1',
      isEntryPoint: false,
      isExternallyImported: false,
      isTypeExport: false,
    },
  ],
  singleImports: [],
  barrelImports: [],
  dynamicImports: [],
  sideEffectImports: [],
  singleReexports: [],
  barrelReexports: [],
};

const EXPECTED_FILE_C_DATA: StrippedResolvedFileDetails = {
  fileType: 'other',
};

const EXPECTED_FILE_D_DECLARATION: StrippedResolvedFileDetails = {
  entryPointSpecifier: undefined,
  isExternallyImported: false,
  exports: [
    {
      type: 'export',
      exportName: 'getD1',
      isEntryPoint: false,
      isExternallyImported: false,
      isTypeExport: false,
    },
    {
      type: 'export',
      exportName: 'D2',
      isEntryPoint: false,
      isExternallyImported: false,
      isTypeExport: true,
    },
  ],
  fileType: 'code',
  singleImports: [],
  barrelImports: [],
  dynamicImports: [],
  sideEffectImports: [],
  singleReexports: [],
  barrelReexports: [],
};

const EXPECTED_FILE_D: StrippedResolvedFileDetails = {
  entryPointSpecifier: undefined,
  isExternallyImported: false,
  exports: [
    {
      type: 'export',
      exportName: 'getD1',
      isEntryPoint: false,
      isExternallyImported: false,
      isTypeExport: false,
    },
  ],
  fileType: 'code',
  singleImports: [],
  barrelImports: [],
  dynamicImports: [],
  sideEffectImports: [],
  singleReexports: [],
  barrelReexports: [],
};

const EXPECTED_FILE_E: StrippedResolvedFileDetails = {
  entryPointSpecifier: undefined,
  isExternallyImported: false,
  fileType: 'code',
  exports: [
    {
      type: 'export',
      exportName: 'e1',
      isEntryPoint: false,
      isExternallyImported: false,
      isTypeExport: false,
    },
  ],
  singleImports: [],
  barrelImports: [],
  dynamicImports: [],
  sideEffectImports: [],
  singleReexports: [],
  barrelReexports: [],
};

const EXPECTED_FILE_F_DECLARATION: StrippedResolvedFileDetails = {
  entryPointSpecifier: undefined,
  isExternallyImported: false,
  exports: [
    {
      type: 'export',
      exportName: 'F1',
      isEntryPoint: false,
      isExternallyImported: false,
      isTypeExport: true,
    },
    {
      type: 'export',
      exportName: 'getF1',
      isEntryPoint: false,
      isExternallyImported: false,
      isTypeExport: false,
    },
  ],
  fileType: 'code',
  singleImports: [],
  barrelImports: [],
  dynamicImports: [],
  sideEffectImports: [],
  singleReexports: [],
  barrelReexports: [],
};

const EXPECTED_FILE_F: StrippedResolvedFileDetails = {
  entryPointSpecifier: undefined,
  isExternallyImported: false,
  fileType: 'code',
  exports: [
    {
      type: 'export',
      exportName: 'getF1',
      isEntryPoint: false,
      isExternallyImported: false,
      isTypeExport: false,
    },
  ],
  singleImports: [
    {
      type: 'singleImport',
      importAlias: 'fake',
      importName: 'fake',
      isTypeImport: false,
      moduleSpecifier: './fake',
      resolvedModuleType: 'firstPartyOther',
      resolvedModulePath: undefined,
    },
  ],
  barrelImports: [],
  dynamicImports: [],
  sideEffectImports: [],
  singleReexports: [],
  barrelReexports: [],
};

const EXPECTED = {
  [FILE_A]: EXPECTED_FILE_A,
  [FILE_INDEX]: EXPECTED_FILE_INDEX,
  [FILE_B]: EXPECTED_FILE_B,
  [FILE_C]: EXPECTED_FILE_C,
  [FILE_C_DATA]: EXPECTED_FILE_C_DATA,
  [FILE_D_DECLARATION]: EXPECTED_FILE_D_DECLARATION,
  [FILE_D]: EXPECTED_FILE_D,
  [FILE_E]: EXPECTED_FILE_E,
  [FILE_F_DECLARATION]: EXPECTED_FILE_F_DECLARATION,
  [FILE_F]: EXPECTED_FILE_F,
};

function makeBaseInfo() {
  return computeBaseInfo({
    packageRootDir: TEST_PACKAGE_DIR,
    packageName: 'test',
    // This takes in the already formatted version, hence why we join() here
    wildcardAliases: { '@/': TEST_PACKAGE_DIR },
    fixedAliases: { '@alias': join(TEST_PACKAGE_DIR, 'one/b.ts') },
    ignorePatterns: [],
    ignoreOverridePatterns: [],
    defaultIgnoreOverrides: [],
    getEntryPointSpecifier: () => undefined,
    isExternallyImportedCheck: () => false,
  });
}

it('Computes resolved into', () => {
  const info = computeResolvedInfo(makeBaseInfo());
  expect(info).toMatchResolvedSpec(EXPECTED);
});

it('Adds and updates resolved info for files', () => {
  const baseInfo = makeBaseInfo();
  const resolvedInfo = computeResolvedInfo(baseInfo);

  // Add a new code file that imports from FILE_B
  addBaseInfoForFile(
    {
      filePath: NEW_FILE_PATH,
      fileContents: `import { b1 } from './one/b';\nexport const newThing = 1;`,
      getEntryPointSpecifier: () => undefined,
      isExternallyImportedCheck: () => false,
    },
    baseInfo
  );
  computeFolderTree(baseInfo);
  addResolvedInfoForFile(NEW_FILE_PATH, baseInfo, resolvedInfo);

  expect(resolvedInfo).toMatchResolvedSpec({
    ...EXPECTED,
    [NEW_FILE_PATH]: {
      fileType: 'code',
      entryPointSpecifier: undefined,
      isExternallyImported: false,
      exports: [
        {
          type: 'export',
          exportName: 'newThing',
          isEntryPoint: false,
          isExternallyImported: false,
          isTypeExport: false,
        },
      ],
      singleImports: [
        {
          type: 'singleImport',
          importAlias: 'b1',
          importName: 'b1',
          isTypeImport: false,
          moduleSpecifier: './one/b',
          resolvedModuleType: 'firstPartyCode',
          resolvedModulePath: FILE_B,
        },
      ],
      barrelImports: [],
      dynamicImports: [],
      sideEffectImports: [],
      singleReexports: [],
      barrelReexports: [],
    },
  });

  // Adding a non-code file goes through the else branch of addResolvedInfoForFile
  const NEW_JSON_PATH = join(TEST_PACKAGE_DIR, 'newData.json');
  baseInfo.files.set(NEW_JSON_PATH, { fileType: 'other' });
  addResolvedInfoForFile(NEW_JSON_PATH, baseInfo, resolvedInfo);
  expect(resolvedInfo.files.get(NEW_JSON_PATH)).toEqual({ fileType: 'other' });

  // Update the code file to have a different import
  updateBaseInfoForFile(
    {
      filePath: NEW_FILE_PATH,
      fileContents: `import { c1 } from './one/c';\nexport const newThing = 1;`,
      getEntryPointSpecifier: () => undefined,
      isExternallyImportedCheck: () => false,
    },
    baseInfo
  );
  updateResolvedInfoForFile(NEW_FILE_PATH, baseInfo, resolvedInfo);

  expect(resolvedInfo).toMatchResolvedSpec({
    ...EXPECTED,
    [NEW_FILE_PATH]: {
      fileType: 'code',
      entryPointSpecifier: undefined,
      isExternallyImported: false,
      exports: [
        {
          type: 'export',
          exportName: 'newThing',
          isEntryPoint: false,
          isExternallyImported: false,
          isTypeExport: false,
        },
      ],
      singleImports: [
        {
          type: 'singleImport',
          importAlias: 'c1',
          importName: 'c1',
          isTypeImport: false,
          moduleSpecifier: './one/c',
          resolvedModuleType: 'firstPartyCode',
          resolvedModulePath: FILE_C,
        },
      ],
      barrelImports: [],
      dynamicImports: [],
      sideEffectImports: [],
      singleReexports: [],
      barrelReexports: [],
    },
    [NEW_JSON_PATH]: {
      fileType: 'other',
    },
  });
});

it('deleteResolvedInfoForFile recomputes files that import the deleted file', () => {
  const baseInfo = makeBaseInfo();
  const resolvedInfo = computeResolvedInfo(baseInfo);

  // Delete FILE_B which is imported by FILE_A. Production code calls
  // deleteResolvedInfoForFile before deleteBaseInfoForFile so that baseInfo
  // still contains the entry needed for the initial lookup.
  deleteResolvedInfoForFile(FILE_B, baseInfo, resolvedInfo);

  // FILE_B must be gone from resolved info
  expect(resolvedInfo.files.has(FILE_B)).toBe(false);

  // FILE_A imported FILE_B, so getFileReferences found it and recomputed it
  expect(resolvedInfo.files.has(FILE_A)).toBe(true);
});

it('Resolves Vite-style imports with query strings', () => {
  const baseInfo = makeBaseInfo();
  const resolvedInfo = computeResolvedInfo(baseInfo);

  addBaseInfoForFile(
    {
      filePath: NEW_FILE_PATH,
      fileContents: `import { b1 } from './one/b?raw';`,
      getEntryPointSpecifier: () => undefined,
      isExternallyImportedCheck: () => false,
    },
    baseInfo
  );
  computeFolderTree(baseInfo);
  addResolvedInfoForFile(NEW_FILE_PATH, baseInfo, resolvedInfo);

  expect(resolvedInfo).toMatchResolvedSpec({
    ...EXPECTED,
    [NEW_FILE_PATH]: {
      fileType: 'code',
      entryPointSpecifier: undefined,
      isExternallyImported: false,
      exports: [],
      singleImports: [
        {
          type: 'singleImport',
          importAlias: 'b1',
          importName: 'b1',
          isTypeImport: false,
          moduleSpecifier: './one/b?raw',
          resolvedModuleType: 'firstPartyCode',
          resolvedModulePath: FILE_B,
        },
      ],
      barrelImports: [],
      dynamicImports: [],
      sideEffectImports: [],
      singleReexports: [],
      barrelReexports: [],
    },
  });
});

it('Resolves an extensionless import when one code file shares a basename with a non-code file', () => {
  // This exercises the `default` case in findFileWithExtension: two files with
  // the same basename but extensions that aren't a .js/.d.ts pair.  The
  // resolver should pick the single code file.
  const SHARED_TS = join(TEST_PACKAGE_DIR, 'sharedName.ts');
  const SHARED_JSON = join(TEST_PACKAGE_DIR, 'sharedName.json');
  const CONSUMER_PATH = join(TEST_PACKAGE_DIR, 'consumer.ts');

  const baseInfo = makeBaseInfo();
  const resolvedInfo = computeResolvedInfo(baseInfo);

  addBaseInfoForFile(
    {
      filePath: SHARED_TS,
      fileContents: `export const x = 1;`,
      getEntryPointSpecifier: () => undefined,
      isExternallyImportedCheck: () => false,
    },
    baseInfo
  );
  baseInfo.files.set(SHARED_JSON, { fileType: 'other' });
  addBaseInfoForFile(
    {
      filePath: CONSUMER_PATH,
      fileContents: `import { x } from './sharedName';`,
      getEntryPointSpecifier: () => undefined,
      isExternallyImportedCheck: () => false,
    },
    baseInfo
  );
  computeFolderTree(baseInfo);
  addResolvedInfoForFile(CONSUMER_PATH, baseInfo, resolvedInfo);

  expect(resolvedInfo).toMatchResolvedSpec({
    ...EXPECTED,
    [CONSUMER_PATH]: {
      fileType: 'code',
      entryPointSpecifier: undefined,
      isExternallyImported: false,
      exports: [],
      singleImports: [
        {
          type: 'singleImport',
          importAlias: 'x',
          importName: 'x',
          isTypeImport: false,
          moduleSpecifier: './sharedName',
          resolvedModuleType: 'firstPartyCode',
          resolvedModulePath: SHARED_TS,
        },
      ],
      barrelImports: [],
      dynamicImports: [],
      sideEffectImports: [],
      singleReexports: [],
      barrelReexports: [],
    },
  });
});
