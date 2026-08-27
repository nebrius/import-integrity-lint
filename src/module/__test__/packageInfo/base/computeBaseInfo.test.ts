import { join } from 'node:path';

import type { StrippedBaseFileDetails } from '../../../../__test__/util.js';
import {
  addBaseInfoForFile,
  computeBaseInfo,
  deleteBaseInfoForFile,
  updateBaseInfoForFile,
} from '../../../computeBaseInfo.js';

const TEST_PACKAGE_DIR = join(import.meta.dirname, 'project');
const FILE_A = join(TEST_PACKAGE_DIR, 'a.ts');
const FILE_B = join(TEST_PACKAGE_DIR, 'b.ts');
const FILE_C = join(TEST_PACKAGE_DIR, 'c.ts');
const FILE_D = join(TEST_PACKAGE_DIR, 'd.ts');
const FILE_E = join(TEST_PACKAGE_DIR, 'e.json');

const EXPECTED_FILE_A: StrippedBaseFileDetails = {
  fileType: 'code',
  entryPointSpecifier: undefined,
  isExternallyImported: false,
  exports: [
    {
      type: 'export',
      exportName: 'Foo',
      isEntryPoint: false,
      isExternallyImported: false,
      isTypeExport: true,
    },
    {
      type: 'export',
      exportName: 'Bar',
      isEntryPoint: false,
      isExternallyImported: false,
      isTypeExport: true,
    },
    {
      type: 'export',
      exportName: 'a1',
      isEntryPoint: false,
      isExternallyImported: false,
      isTypeExport: false,
    },
    {
      type: 'export',
      exportName: 'a2',
      isEntryPoint: false,
      isExternallyImported: false,
      isTypeExport: false,
    },
    {
      type: 'export',
      exportName: 'a3',
      isEntryPoint: false,
      isExternallyImported: false,
      isTypeExport: false,
    },
    {
      type: 'export',
      exportName: 'a4',
      isEntryPoint: false,
      isExternallyImported: false,
      isTypeExport: false,
    },
    {
      type: 'export',
      exportName: 'a5',
      isEntryPoint: false,
      isExternallyImported: false,
      isTypeExport: false,
    },
    {
      type: 'export',
      exportName: 'a6',
      isEntryPoint: false,
      isExternallyImported: false,
      isTypeExport: false,
    },
    {
      type: 'export',
      exportName: 'A7',
      isEntryPoint: false,
      isExternallyImported: false,
      isTypeExport: false,
    },
    {
      type: 'export',
      exportName: 'a8',
      isEntryPoint: false,
      isExternallyImported: false,
      isTypeExport: false,
    },
    {
      type: 'export',
      exportName: 'a9',
      isEntryPoint: false,
      isExternallyImported: false,
      isTypeExport: false,
    },
    {
      type: 'export',
      exportName: 'a10_1',
      isEntryPoint: false,
      isExternallyImported: false,
      isTypeExport: false,
    },
    {
      type: 'export',
      exportName: 'a10_2alias',
      isEntryPoint: false,
      isExternallyImported: false,
      isTypeExport: false,
    },
    {
      type: 'export',
      exportName: 'a10_rest',
      isEntryPoint: false,
      isExternallyImported: false,
      isTypeExport: false,
    },
    {
      type: 'export',
      exportName: 'a11_1',
      isEntryPoint: false,
      isExternallyImported: false,
      isTypeExport: false,
    },
    {
      type: 'export',
      exportName: 'a11_2',
      isEntryPoint: false,
      isExternallyImported: false,
      isTypeExport: false,
    },
    {
      type: 'export',
      exportName: 'a11_rest',
      isEntryPoint: false,
      isExternallyImported: false,
      isTypeExport: false,
    },
    {
      type: 'export',
      exportName: 'a twelve',
      isEntryPoint: false,
      isExternallyImported: false,
      isTypeExport: false,
    },
    {
      type: 'export',
      exportName: 'a13',
      isEntryPoint: false,
      isExternallyImported: false,
      isTypeExport: false,
    },
    {
      type: 'export',
      exportName: 'a14',
      isEntryPoint: false,
      isExternallyImported: false,
      isTypeExport: false,
    },
    {
      type: 'export',
      exportName: 'a15alias',
      isEntryPoint: false,
      isExternallyImported: false,
      isTypeExport: false,
    },
    {
      type: 'export',
      exportName: 'a16alias',
      isEntryPoint: false,
      isExternallyImported: false,
      isTypeExport: false,
    },
    {
      type: 'export',
      exportName: 'default',
      isEntryPoint: false,
      isExternallyImported: false,
      isTypeExport: false,
    },
    {
      type: 'export',
      exportName: 'a18_1',
      isEntryPoint: false,
      isExternallyImported: false,
      isTypeExport: false,
    },
    {
      type: 'export',
      exportName: 'a18_2',
      isEntryPoint: false,
      isExternallyImported: false,
      isTypeExport: false,
    },
    {
      type: 'export',
      exportName: 'a18_3',
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

const EXPECTED_FILE_B: StrippedBaseFileDetails = {
  entryPointSpecifier: undefined,
  isExternallyImported: false,
  exports: [
    {
      type: 'export',
      exportName: 'default',
      isEntryPoint: false,
      isExternallyImported: false,
      isTypeExport: false,
    },
  ],
  fileType: 'code',
  singleImports: [
    {
      type: 'singleImport',
      importAlias: 'defaultExport1',
      importName: 'default',
      isTypeImport: false,
      moduleSpecifier: './a',
    },
    {
      type: 'singleImport',
      importAlias: 'a1',
      importName: 'a1',
      isTypeImport: false,
      moduleSpecifier: './a',
    },
    {
      type: 'singleImport',
      importAlias: 'a1Alias',
      importName: 'a1',
      isTypeImport: false,
      moduleSpecifier: './a',
    },
    {
      type: 'singleImport',
      importAlias: 'defaultAlias',
      importName: 'default',
      isTypeImport: false,
      moduleSpecifier: './a',
    },
    {
      type: 'singleImport',
      importAlias: 'stringAlias',
      importName: 'a twelve',
      isTypeImport: false,
      moduleSpecifier: './a',
    },
    {
      type: 'singleImport',
      importAlias: 'defaultExport2',
      importName: 'default',
      isTypeImport: false,
      moduleSpecifier: './a',
    },
    {
      type: 'singleImport',
      importAlias: 'a1WithDefault',
      importName: 'a1',
      isTypeImport: false,
      moduleSpecifier: './a',
    },
    {
      type: 'singleImport',
      importAlias: 'defaultExport3',
      importName: 'default',
      isTypeImport: false,
      moduleSpecifier: './a',
    },
    {
      type: 'singleImport',
      importAlias: 'e1',
      importName: 'e1',
      isTypeImport: false,
      moduleSpecifier: './e',
    },
  ],
  barrelImports: [
    {
      type: 'barrelImport',
      importAlias: 'barrel1',
      moduleSpecifier: './a',
    },
    {
      type: 'barrelImport',
      importAlias: 'barrel2',
      moduleSpecifier: './a',
    },
  ],
  dynamicImports: [
    {
      type: 'dynamicImport',
      moduleSpecifier: './a.js',
    },
  ],
  sideEffectImports: [
    {
      type: 'sideEffectImport',
      moduleSpecifier: './a.js',
    },
  ],
  singleReexports: [],
  barrelReexports: [],
};

const EXPECTED_FILE_C: StrippedBaseFileDetails = {
  fileType: 'code',
  entryPointSpecifier: undefined,
  isExternallyImported: false,
  exports: [
    {
      type: 'export',
      exportName: 'default',
      isEntryPoint: false,
      isExternallyImported: false,
      isTypeExport: false,
    },
  ],
  singleImports: [],
  barrelImports: [],
  dynamicImports: [],
  sideEffectImports: [],
  singleReexports: [
    {
      type: 'singleReexport',
      exportName: 'a1',
      importName: 'a1',
      isTypeReexport: false,
      moduleSpecifier: './a',
      isEntryPoint: false,
      isExternallyImported: false,
    },
    {
      type: 'singleReexport',
      exportName: 'c1',
      importName: 'default',
      isTypeReexport: false,
      moduleSpecifier: './a',
      isEntryPoint: false,
      isExternallyImported: false,
    },
    {
      type: 'singleReexport',
      exportName: 'c2',
      importName: 'a1',
      isTypeReexport: false,
      moduleSpecifier: './a',
      isEntryPoint: false,
      isExternallyImported: false,
    },
    {
      type: 'singleReexport',
      exportName: 'Foo',
      importName: 'Foo',
      isTypeReexport: true,
      moduleSpecifier: './a',
      isEntryPoint: false,
      isExternallyImported: false,
    },
  ],
  barrelReexports: [
    {
      type: 'barrelReexport',
      exportName: undefined,
      moduleSpecifier: './a',
      isEntryPoint: false,
      isExternallyImported: false,
    },
    {
      type: 'barrelReexport',
      exportName: 'c',
      moduleSpecifier: './a',
      isEntryPoint: false,
      isExternallyImported: false,
    },
  ],
};

const EXPECTED_FILE_D: StrippedBaseFileDetails = {
  entryPointSpecifier: undefined,
  isExternallyImported: false,
  exports: [
    {
      type: 'export',
      exportName: 'default',
      isEntryPoint: false,
      isExternallyImported: false,
      isTypeExport: true,
    },
    {
      type: 'export',
      exportName: 'MyNamespace',
      isEntryPoint: false,
      isExternallyImported: false,

      // Namespaces are like enums, and so are actually runtime things
      isTypeExport: false,
    },
    {
      type: 'export',
      exportName: 'd',
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

const EXPECTED_FILE_E: StrippedBaseFileDetails = {
  fileType: 'other',
};

const EXPECTED = {
  [FILE_A]: EXPECTED_FILE_A,
  [FILE_B]: EXPECTED_FILE_B,
  [FILE_C]: EXPECTED_FILE_C,
  [FILE_D]: EXPECTED_FILE_D,
  [FILE_E]: EXPECTED_FILE_E,
};

it('Computes base info', () => {
  const info = computeBaseInfo({
    packageRootDir: TEST_PACKAGE_DIR,
    packageName: 'test',
    wildcardAliases: {},
    fixedAliases: {},
    ignorePatterns: [],
    ignoreOverridePatterns: [],
    defaultIgnoreOverrides: [],
    getEntryPointSpecifier: () => undefined,
    isExternallyImportedCheck: () => false,
  });
  expect(info).toMatchBaseSpec(EXPECTED);
});

const NEW_FILE_PATH = join(TEST_PACKAGE_DIR, 'newFile.ts');
const NEW_FILE_CONTENTS_ADD = `import { a1 } from './a'`;
const NEW_FILE_CONTENTS_MODIFY = `import { a2 } from './a';
import { a1 } from './a';
export { a1 } from './a';
export const newFile1 = 10;`;
const NEW_FILE_CONTENTS_MODIFY_2 = `import { a1 } from './a';
import { a2 } from './a';
export { a1 } from './a';
export const newFile1 = 10;`;

it('Adds, modifies, and deletes a new file', () => {
  const info = computeBaseInfo({
    packageRootDir: TEST_PACKAGE_DIR,
    packageName: 'test',
    wildcardAliases: {},
    fixedAliases: {},
    ignorePatterns: [],
    ignoreOverridePatterns: [],
    defaultIgnoreOverrides: [],
    getEntryPointSpecifier: () => undefined,
    isExternallyImportedCheck: () => false,
  });

  addBaseInfoForFile(
    {
      filePath: NEW_FILE_PATH,
      fileContents: NEW_FILE_CONTENTS_ADD,
      getEntryPointSpecifier: () => undefined,
      isExternallyImportedCheck: () => false,
    },
    info
  );
  expect(info).toMatchBaseSpec({
    ...EXPECTED,
    [NEW_FILE_PATH]: {
      entryPointSpecifier: undefined,
      isExternallyImported: false,
      fileType: 'code',
      singleImports: [
        {
          type: 'singleImport',
          importAlias: 'a1',
          importName: 'a1',
          isTypeImport: false,
          moduleSpecifier: './a',
        },
      ],
      barrelImports: [],
      dynamicImports: [],
      sideEffectImports: [],
      singleReexports: [],
      barrelReexports: [],
      exports: [],
    },
  });

  updateBaseInfoForFile(
    {
      filePath: NEW_FILE_PATH,
      fileContents: NEW_FILE_CONTENTS_MODIFY,
      getEntryPointSpecifier: () => undefined,
      isExternallyImportedCheck: () => false,
    },
    info
  );
  expect(info).toMatchBaseSpec({
    ...EXPECTED,
    [NEW_FILE_PATH]: {
      entryPointSpecifier: undefined,
      isExternallyImported: false,
      fileType: 'code',
      singleImports: [
        {
          type: 'singleImport',
          importAlias: 'a2',
          importName: 'a2',
          isTypeImport: false,
          moduleSpecifier: './a',
        },
        {
          type: 'singleImport',
          importAlias: 'a1',
          importName: 'a1',
          isTypeImport: false,
          moduleSpecifier: './a',
        },
      ],
      barrelImports: [],
      dynamicImports: [],
      sideEffectImports: [],
      singleReexports: [
        {
          type: 'singleReexport',
          exportName: 'a1',
          importName: 'a1',
          isTypeReexport: false,
          moduleSpecifier: './a',
          isEntryPoint: false,
          isExternallyImported: false,
        },
      ],
      barrelReexports: [],
      exports: [
        {
          type: 'export',
          exportName: 'newFile1',
          isEntryPoint: false,
          isExternallyImported: false,
          isTypeExport: false,
        },
      ],
    },
  });
  updateBaseInfoForFile(
    {
      filePath: NEW_FILE_PATH,
      fileContents: NEW_FILE_CONTENTS_MODIFY_2,
      getEntryPointSpecifier: () => undefined,
      isExternallyImportedCheck: () => false,
    },
    info
  );
  expect(info).toMatchBaseSpec({
    ...EXPECTED,
    [NEW_FILE_PATH]: {
      entryPointSpecifier: undefined,
      isExternallyImported: false,
      fileType: 'code',
      singleImports: [
        {
          type: 'singleImport',
          importAlias: 'a1',
          importName: 'a1',
          isTypeImport: false,
          moduleSpecifier: './a',
        },
        {
          type: 'singleImport',
          importAlias: 'a2',
          importName: 'a2',
          isTypeImport: false,
          moduleSpecifier: './a',
        },
      ],
      barrelImports: [],
      dynamicImports: [],
      sideEffectImports: [],
      singleReexports: [
        {
          type: 'singleReexport',
          exportName: 'a1',
          importName: 'a1',
          isEntryPoint: false,
          isExternallyImported: false,
          isTypeReexport: false,
          moduleSpecifier: './a',
        },
      ],
      barrelReexports: [],
      exports: [
        {
          type: 'export',
          exportName: 'newFile1',
          isEntryPoint: false,
          isExternallyImported: false,
          isTypeExport: false,
        },
      ],
    },
  });

  deleteBaseInfoForFile(NEW_FILE_PATH, info);
  expect(info).toMatchBaseSpec(EXPECTED);
});
