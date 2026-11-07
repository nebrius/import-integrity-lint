import { existsSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { parse } from '@typescript-eslint/typescript-estree';

import type { StrippedAnalyzedFileDetails } from '../../../__test__/util.js';
import { getPackageCacheEntryForFile } from '../../../settings/settings.js';
import type {
  AnalyzedCodeFileDetails,
  AnalyzedOtherFileDetails,
} from '../../../types/analyzed.js';
import {
  getPackageInfo,
  initializeRepo,
  updateCacheForFile,
  updateCacheFromFileSystem,
} from '../../module.js';

function assertDefined<T>(
  value: T,
  message: string
): asserts value is NonNullable<T> {
  if (value === undefined || value === null) {
    throw new Error(message);
  }
}

function assertCodeFile(
  value: AnalyzedCodeFileDetails | AnalyzedOtherFileDetails | undefined,
  message: string
): asserts value is AnalyzedCodeFileDetails {
  if (!value || value.fileType !== 'code') {
    throw new Error(message);
  }
}

// Regression guard for the `initializePackageInfo` duplication bug: the bug
// pushed the same `importEntry` object reference into `externallyImportedBy`
// more than once. Track object identity directly so this guard stays accurate
// even when fixtures legitimately contain multiple imports of the same type
// from the same file (which would share `(filePath, importEntry.type)` but not
// object identity).
function expectNoDuplicateExternalImporters(
  entries: ReadonlyArray<{ importEntry: object }>
) {
  const seen = new WeakSet<object>();
  for (const entry of entries) {
    expect(seen.has(entry.importEntry)).toBe(false);
    seen.add(entry.importEntry);
  }
}

const MONOREPO_DIR = join(import.meta.dirname, 'project', 'monorepo');
const PACKAGE_ONE_DIR = join(MONOREPO_DIR, 'packages', 'packageOne');
const PACKAGE_TWO_DIR = join(MONOREPO_DIR, 'packages', 'packageTwo');

const FILE_A = join(PACKAGE_ONE_DIR, 'a.ts');
const FILE_B = join(PACKAGE_ONE_DIR, 'b.ts');
const FILE_C = join(PACKAGE_TWO_DIR, 'c.ts');
const FILE_D = join(PACKAGE_TWO_DIR, 'd.ts');
const FILE_E = join(PACKAGE_TWO_DIR, 'e.ts');
const FILE_TS_NEW_PKG1 = join(PACKAGE_ONE_DIR, 'new.ts');
const FILE_TS_NEW_PKG2 = join(PACKAGE_TWO_DIR, 'new.ts');
const FILE_JSON_NEW = join(PACKAGE_ONE_DIR, 'new.json');

// import-integrity.config.json and package.json files live inside each
// packageRootDir and are picked up by the package scanner as non-code files.
//
// The package.json files are load-bearing for these tests: initializePackageInfo
// identifies first-party packages by the `name` field in each package.json and
// matches cross-package imports against those names. If either package.json
// were missing, packageName would be undefined and cross-package wiring would
// silently skip, causing every externallyImportedBy assertion below to fail.
const PKG1_CONFIG = join(PACKAGE_ONE_DIR, 'import-integrity.config.json');
const PKG2_CONFIG = join(PACKAGE_TWO_DIR, 'import-integrity.config.json');
const PKG1_PACKAGE_JSON = join(PACKAGE_ONE_DIR, 'package.json');
const PKG2_PACKAGE_JSON = join(PACKAGE_TWO_DIR, 'package.json');

const EXPECTED_OTHER_FILE: StrippedAnalyzedFileDetails = { fileType: 'other' };

const EMPTY_CODE_FILE: StrippedAnalyzedFileDetails = {
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

// Set up state by running initializeRepo, then return the package settings
// derived from the populated cache so that downstream updateCacheForFile /
// updateCacheFromFileSystem calls see real entry-point configuration.
function initialize() {
  initializeRepo({
    filename: FILE_A,
    settings: {
      'import-integrity': { monorepoRootDir: MONOREPO_DIR },
    },
  });
  const packageOneSettings = getPackageCacheEntryForFile(FILE_A);
  const packageTwoSettings = getPackageCacheEntryForFile(FILE_C);
  assertDefined(
    packageOneSettings,
    'packageOneSettings not populated by initializeRepo'
  );
  assertDefined(
    packageTwoSettings,
    'packageTwoSettings not populated by initializeRepo'
  );
  return { packageOneSettings, packageTwoSettings };
}

// The d.ts cross-package single import of `One` from `@test/package-one/a`
// shows up as a thirdParty single import since the specifier matches a known
// subpath entry point of a first-party package name.
const FILE_D_SINGLE_IMPORT = {
  type: 'singleImport' as const,
  importAlias: 'One',
  importName: 'One',
  isTypeImport: true,
  moduleSpecifier: '@test/package-one/a',
  resolvedModuleType: 'thirdParty' as const,
  rootModuleType: 'thirdParty' as const,
};

// The e.ts cross-package barrel import of `@test/package-one/a` shows up as a
// thirdParty barrel import, which lights up externallyImportedBy on every
// entry-point export of the target package's subpath file.
const FILE_E_BARREL_IMPORT = {
  type: 'barrelImport' as const,
  isTypeImport: false,
  importAlias: 'pkg',
  moduleSpecifier: '@test/package-one/a',
  resolvedModuleType: 'thirdParty' as const,
};

type ExternalImporter = {
  packageRootDir: string;
  filePath: string;
  importEntry: typeof FILE_D_SINGLE_IMPORT;
};

function buildExpectedFileA({
  withCrossPackage,
  additionalEntryPointExports = [],
  extraAlsoOneSingleImporters = [],
}: {
  withCrossPackage: boolean;
  additionalEntryPointExports?: string[];
  // initializePackageInfo iterates packageTwo's files in insertion order
  // (c → d → e) and within each file pushes singleImports then barrelImports.
  // Extra single importers come from files iterated before e.ts, so they
  // land before the e.ts barrel entry in externallyImportedBy.
  extraAlsoOneSingleImporters?: ExternalImporter[];
}): StrippedAnalyzedFileDetails {
  const oneExternallyImportedBy = withCrossPackage
    ? [
        {
          packageRootDir: PACKAGE_TWO_DIR,
          filePath: FILE_D,
          importEntry: FILE_D_SINGLE_IMPORT,
        },
        {
          packageRootDir: PACKAGE_TWO_DIR,
          filePath: FILE_E,
          importEntry: FILE_E_BARREL_IMPORT,
        },
      ]
    : [];
  // Any entry-point export in a.ts is picked up by e.ts's
  // `import * as pkg from '@test/package-one/a'` barrel, so AlsoOne and each
  // additional entry-point export share the same externallyImportedBy shape.
  const barrelOnlyExternallyImportedBy = withCrossPackage
    ? [
        {
          packageRootDir: PACKAGE_TWO_DIR,
          filePath: FILE_E,
          importEntry: FILE_E_BARREL_IMPORT,
        },
      ]
    : [];
  const alsoOneExternallyImportedBy = withCrossPackage
    ? [...extraAlsoOneSingleImporters, ...barrelOnlyExternallyImportedBy]
    : [];

  return {
    fileType: 'code',
    entryPointSpecifier: '@test/package-one/a',
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
        externallyImportedBy: oneExternallyImportedBy,
        isEntryPoint: true,
        isExternallyImported: false,
      },
      {
        type: 'export',
        exportName: 'AlsoOne',
        isTypeExport: true,
        importedBy: [],
        barrelImportedBy: [],
        externallyImportedBy: alsoOneExternallyImportedBy,
        isEntryPoint: true,
        isExternallyImported: false,
      },
      ...additionalEntryPointExports.map((exportName) => ({
        type: 'export' as const,
        exportName,
        isTypeExport: true,
        importedBy: [],
        barrelImportedBy: [],
        externallyImportedBy: barrelOnlyExternallyImportedBy,
        isEntryPoint: true,
        isExternallyImported: false,
      })),
    ],
    singleReexports: [],
    // The named barrel re-export is an entry-point export too, so e.ts's
    // barrel import lights it up exactly like the exports above. b.ts has no
    // exports of its own, so nothing is reachable through the namespace.
    barrelReexports: [
      {
        type: 'barrelReexport',
        isTypeReexport: false,
        moduleSpecifier: './b',
        exportName: 'ns',
        isEntryPoint: true,
        isExternallyImported: false,
        resolvedModuleType: 'firstPartyCode',
        resolvedModulePath: FILE_B,
        importedBy: [],
        barrelImportedBy: [],
        externallyImportedBy: barrelOnlyExternallyImportedBy,
      },
    ],
  };
}

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
        isEntryPoint: true,
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

const EXPECTED_FILE_C: StrippedAnalyzedFileDetails = {
  fileType: 'code',
  entryPointSpecifier: '@test/package-two',
  isExternallyImported: false,
  singleImports: [],
  barrelImports: [],
  dynamicImports: [],
  sideEffectImports: [],
  exports: [
    {
      type: 'export',
      exportName: 'Two',
      isTypeExport: true,
      importedBy: [],
      barrelImportedBy: [],
      externallyImportedBy: [],
      isEntryPoint: true,
      isExternallyImported: false,
    },
  ],
  singleReexports: [],
  barrelReexports: [],
};

const EXPECTED_FILE_D: StrippedAnalyzedFileDetails = {
  fileType: 'code',
  entryPointSpecifier: undefined,
  isExternallyImported: false,
  singleImports: [FILE_D_SINGLE_IMPORT],
  barrelImports: [],
  dynamicImports: [],
  sideEffectImports: [],
  exports: [],
  singleReexports: [],
  barrelReexports: [],
};

const EXPECTED_FILE_E: StrippedAnalyzedFileDetails = {
  fileType: 'code',
  entryPointSpecifier: undefined,
  isExternallyImported: false,
  singleImports: [],
  barrelImports: [FILE_E_BARREL_IMPORT],
  dynamicImports: [],
  sideEffectImports: [],
  exports: [],
  singleReexports: [],
  barrelReexports: [],
};

function expectedPkg1({
  withCrossPackage,
  extras = {},
}: {
  withCrossPackage: boolean;
  extras?: Record<string, StrippedAnalyzedFileDetails>;
}) {
  return {
    [FILE_A]: buildExpectedFileA({ withCrossPackage }),
    [FILE_B]: EXPECTED_FILE_B,
    [PKG1_CONFIG]: EXPECTED_OTHER_FILE,
    [PKG1_PACKAGE_JSON]: EXPECTED_OTHER_FILE,
    ...extras,
  };
}

const EXPECTED_PKG2 = {
  [FILE_C]: EXPECTED_FILE_C,
  [FILE_D]: EXPECTED_FILE_D,
  [FILE_E]: EXPECTED_FILE_E,
  [PKG2_CONFIG]: EXPECTED_OTHER_FILE,
  [PKG2_PACKAGE_JSON]: EXPECTED_OTHER_FILE,
};

function parseContents(contents: string) {
  return parse(contents, {
    loc: true,
    range: true,
    tokens: true,
    jsx: true,
  });
}

const EMPTY_AST = parseContents('');

afterEach(() => {
  for (const path of [FILE_TS_NEW_PKG1, FILE_TS_NEW_PKG2, FILE_JSON_NEW]) {
    if (existsSync(path)) {
      unlinkSync(path);
    }
  }
});

it('Initializes both packages and returns correct package info per package', () => {
  initialize();

  const pkg1Info = getPackageInfo(PACKAGE_ONE_DIR);
  expect(pkg1Info).toMatchAnalyzedSpec(
    expectedPkg1({ withCrossPackage: true })
  );

  const pkg2Info = getPackageInfo(PACKAGE_TWO_DIR);
  expect(pkg2Info).toMatchAnalyzedSpec(EXPECTED_PKG2);
});

it('Cross-package singleImport populates externallyImportedBy on the matching entry-point export', () => {
  initialize();

  const pkg1Info = getPackageInfo(PACKAGE_ONE_DIR);
  const fileA = pkg1Info.files.get(FILE_A);
  assertCodeFile(fileA, 'FILE_A missing or not a code file');

  // The `One` entry-point export is directly named in d.ts's cross-package
  // single import, so it should reflect that importer (alongside the barrel
  // import from e.ts).
  const oneExport = fileA.exports.find((e) => e.exportName === 'One');
  assertDefined(oneExport, 'One export missing on FILE_A');
  const singleImporters = oneExport.externallyImportedBy.filter(
    (e) => e.importEntry.type === 'singleImport'
  );
  expect(singleImporters).toHaveLength(1);
  expect(singleImporters[0]).toMatchObject({
    packageRootDir: PACKAGE_TWO_DIR,
    filePath: FILE_D,
    importEntry: { type: 'singleImport', importName: 'One' },
  });

  // packageEntryPointExports should expose the entry-point file by specifier.
  expect(pkg1Info.packageEntryPointExports.get('@test/package-one/a')).toBe(
    fileA
  );
});

it('packageEntryPointExports is a Map keyed by import specifier', () => {
  initialize();

  // packageOne registers `./a` under `@test/package-one/a`, and the registered
  // file must be the exact same object stored in `files`. The file's own
  // `entryPointSpecifier` must round-trip back to the map key, and every named
  // export on that file must be marked as an entry-point export (pinning the
  // per-export fidelity that the pre-refactor `Map<exportName, exportEntry>`
  // test provided by construction).
  const pkg1Info = getPackageInfo(PACKAGE_ONE_DIR);
  const fileA = pkg1Info.files.get(FILE_A);
  assertCodeFile(fileA, 'FILE_A missing or not a code file');
  expect([...pkg1Info.packageEntryPointExports.keys()]).toEqual([
    '@test/package-one/a',
  ]);
  const registeredFileA = pkg1Info.packageEntryPointExports.get(
    '@test/package-one/a'
  );
  expect(registeredFileA).toBe(fileA);
  expect(registeredFileA?.entryPointSpecifier).toBe('@test/package-one/a');
  expect(
    fileA.exports
      .map((entry) => ({
        exportName: entry.exportName,
        isEntryPoint: entry.isEntryPoint,
      }))
      .sort((a, b) => a.exportName.localeCompare(b.exportName))
  ).toEqual([
    { exportName: 'AlsoOne', isEntryPoint: true },
    { exportName: 'One', isEntryPoint: true },
  ]);

  const pkg2Info = getPackageInfo(PACKAGE_TWO_DIR);
  const fileC = pkg2Info.files.get(FILE_C);
  assertCodeFile(fileC, 'FILE_C missing or not a code file');
  expect([...pkg2Info.packageEntryPointExports.keys()]).toEqual([
    '@test/package-two',
  ]);
  const registeredFileC =
    pkg2Info.packageEntryPointExports.get('@test/package-two');
  expect(registeredFileC).toBe(fileC);
  expect(registeredFileC?.entryPointSpecifier).toBe('@test/package-two');
  expect(
    fileC.exports.map((entry) => ({
      exportName: entry.exportName,
      isEntryPoint: entry.isEntryPoint,
    }))
  ).toEqual([{ exportName: 'Two', isEntryPoint: true }]);
});

it('Cross-package barrelImport populates externallyImportedBy on every entry-point export', () => {
  initialize();

  const pkg1Info = getPackageInfo(PACKAGE_ONE_DIR);
  const fileA = pkg1Info.files.get(FILE_A);
  assertCodeFile(fileA, 'FILE_A missing or not a code file');

  // Each entry-point export in packageOne should see the barrel importer in
  // packageTwo/e.ts.
  for (const exportName of ['One', 'AlsoOne'] as const) {
    const exportEntry = fileA.exports.find(
      (entry) => entry.exportName === exportName
    );
    if (!exportEntry) {
      throw new Error(`${exportName} export missing on FILE_A`);
    }
    const barrelImporters = exportEntry.externallyImportedBy.filter(
      (e) => e.importEntry.type === 'barrelImport'
    );
    expect(barrelImporters).toHaveLength(1);
    expect(barrelImporters[0]).toMatchObject({
      packageRootDir: PACKAGE_TWO_DIR,
      filePath: FILE_E,
      importEntry: {
        type: 'barrelImport',
        isTypeImport: false,
        moduleSpecifier: '@test/package-one/a',
      },
    });
  }
});

it('Package isolation: adding a file to packageOne does not affect packageTwo', () => {
  const { packageOneSettings } = initialize();

  updateCacheForFile({
    filePath: FILE_TS_NEW_PKG1,
    fileContents: '',
    ast: EMPTY_AST,
    packageSettings: packageOneSettings,
  });

  const pkg1Info = getPackageInfo(PACKAGE_ONE_DIR);
  expect(pkg1Info).toMatchAnalyzedSpec(
    expectedPkg1({
      withCrossPackage: true,
      extras: { [FILE_TS_NEW_PKG1]: EMPTY_CODE_FILE },
    })
  );

  // packageTwo is unaffected
  const pkg2Info = getPackageInfo(PACKAGE_TWO_DIR);
  expect(pkg2Info).toMatchAnalyzedSpec(EXPECTED_PKG2);
});

it('Updates packageOne cache when a new file is added via updateCacheForFile', () => {
  const { packageOneSettings } = initialize();

  let pkg1Info = getPackageInfo(PACKAGE_ONE_DIR);
  expect(pkg1Info).toMatchAnalyzedSpec(
    expectedPkg1({ withCrossPackage: true })
  );

  updateCacheForFile({
    filePath: FILE_TS_NEW_PKG1,
    fileContents: '',
    ast: EMPTY_AST,
    packageSettings: packageOneSettings,
  });

  pkg1Info = getPackageInfo(PACKAGE_ONE_DIR);
  expect(pkg1Info).toMatchAnalyzedSpec(
    expectedPkg1({
      withCrossPackage: true,
      extras: { [FILE_TS_NEW_PKG1]: EMPTY_CODE_FILE },
    })
  );
});

it('Updates packageTwo cache when a new file is added via updateCacheForFile', () => {
  const { packageTwoSettings } = initialize();

  let pkg2Info = getPackageInfo(PACKAGE_TWO_DIR);
  expect(pkg2Info).toMatchAnalyzedSpec(EXPECTED_PKG2);

  updateCacheForFile({
    filePath: FILE_TS_NEW_PKG2,
    fileContents: '',
    ast: EMPTY_AST,
    packageSettings: packageTwoSettings,
  });

  pkg2Info = getPackageInfo(PACKAGE_TWO_DIR);
  expect(pkg2Info).toMatchAnalyzedSpec({
    ...EXPECTED_PKG2,
    [FILE_TS_NEW_PKG2]: EMPTY_CODE_FILE,
  });

  // packageOne is unaffected by cache updates scoped to packageTwo.
  const pkg1Info = getPackageInfo(PACKAGE_ONE_DIR);
  expect(pkg1Info).toMatchAnalyzedSpec(
    expectedPkg1({ withCrossPackage: true })
  );
});

it('Updates packageOne cache when an unused export is added to an existing file', () => {
  const { packageOneSettings } = initialize();

  // Preserve the existing entry-point exports and add a new one
  const FILE_A_UPDATED_CONTENTS = `export type One = string;
export type AlsoOne = number;
export * as ns from './b';
export type Another = string;
`;

  updateCacheForFile({
    filePath: FILE_A,
    fileContents: FILE_A_UPDATED_CONTENTS,
    ast: parseContents(FILE_A_UPDATED_CONTENTS),
    packageSettings: packageOneSettings,
  });

  const EXPECTED_FILE_A_UPDATED = buildExpectedFileA({
    withCrossPackage: true,
    additionalEntryPointExports: ['Another'],
  });

  const pkg1Info = getPackageInfo(PACKAGE_ONE_DIR);
  expect(pkg1Info).toMatchAnalyzedSpec({
    [FILE_A]: EXPECTED_FILE_A_UPDATED,
    [FILE_B]: EXPECTED_FILE_B,
    [PKG1_CONFIG]: EXPECTED_OTHER_FILE,
    [PKG1_PACKAGE_JSON]: EXPECTED_OTHER_FILE,
  });

  // packageTwo is unaffected
  const pkg2Info = getPackageInfo(PACKAGE_TWO_DIR);
  expect(pkg2Info).toMatchAnalyzedSpec(EXPECTED_PKG2);
});

it('Updates packageOne package cache in bulk for a code file', () => {
  const { packageOneSettings } = initialize();

  let pkg1Info = getPackageInfo(PACKAGE_ONE_DIR);
  expect(pkg1Info).toMatchAnalyzedSpec(
    expectedPkg1({ withCrossPackage: true })
  );

  // Add a new file to packageOne
  writeFileSync(FILE_TS_NEW_PKG1, '');
  updateCacheFromFileSystem({
    repoRootDir: packageOneSettings.repoRootDir,
    packageRootDir: packageOneSettings.packageRootDir,
    changes: {
      added: [{ filePath: FILE_TS_NEW_PKG1, latestUpdatedAt: Date.now() }],
      modified: [],
      deleted: [],
    },
    packageJsons: [],
    packageSettings: packageOneSettings,
    operationStart: Date.now(),
  });

  pkg1Info = getPackageInfo(PACKAGE_ONE_DIR);
  expect(pkg1Info).toMatchAnalyzedSpec(
    expectedPkg1({
      withCrossPackage: true,
      extras: { [FILE_TS_NEW_PKG1]: EMPTY_CODE_FILE },
    })
  );

  // packageTwo unchanged
  expect(getPackageInfo(PACKAGE_TWO_DIR)).toMatchAnalyzedSpec(EXPECTED_PKG2);

  // Modify the new file
  writeFileSync(FILE_TS_NEW_PKG1, `console.log()`);
  updateCacheFromFileSystem({
    repoRootDir: packageOneSettings.repoRootDir,
    packageRootDir: packageOneSettings.packageRootDir,
    changes: {
      added: [],
      modified: [{ filePath: FILE_TS_NEW_PKG1, latestUpdatedAt: Date.now() }],
      deleted: [],
    },
    packageJsons: [],
    packageSettings: packageOneSettings,
    operationStart: Date.now(),
  });

  pkg1Info = getPackageInfo(PACKAGE_ONE_DIR);
  expect(pkg1Info).toMatchAnalyzedSpec(
    expectedPkg1({
      withCrossPackage: true,
      extras: { [FILE_TS_NEW_PKG1]: EMPTY_CODE_FILE },
    })
  );

  // Modify with invalid code (should keep previous state)
  writeFileSync(FILE_TS_NEW_PKG1, `+_)(*&^%$%)`);
  updateCacheFromFileSystem({
    repoRootDir: packageOneSettings.repoRootDir,
    packageRootDir: packageOneSettings.packageRootDir,
    changes: {
      added: [],
      modified: [{ filePath: FILE_TS_NEW_PKG1, latestUpdatedAt: Date.now() }],
      deleted: [],
    },
    packageJsons: [],
    packageSettings: packageOneSettings,
    operationStart: Date.now(),
  });

  pkg1Info = getPackageInfo(PACKAGE_ONE_DIR);
  expect(pkg1Info).toMatchAnalyzedSpec(
    expectedPkg1({
      withCrossPackage: true,
      extras: { [FILE_TS_NEW_PKG1]: EMPTY_CODE_FILE },
    })
  );

  // Delete the file
  unlinkSync(FILE_TS_NEW_PKG1);
  updateCacheFromFileSystem({
    repoRootDir: packageOneSettings.repoRootDir,
    packageRootDir: packageOneSettings.packageRootDir,
    changes: {
      added: [],
      modified: [],
      deleted: [FILE_TS_NEW_PKG1],
    },
    packageJsons: [],
    packageSettings: packageOneSettings,
    operationStart: Date.now(),
  });

  pkg1Info = getPackageInfo(PACKAGE_ONE_DIR);
  expect(pkg1Info).toMatchAnalyzedSpec(
    expectedPkg1({ withCrossPackage: true })
  );

  // packageTwo still unchanged throughout
  expect(getPackageInfo(PACKAGE_TWO_DIR)).toMatchAnalyzedSpec(EXPECTED_PKG2);
});

it('Updates package cache in bulk for a non-code file in packageOne', () => {
  const { packageOneSettings } = initialize();

  let pkg1Info = getPackageInfo(PACKAGE_ONE_DIR);
  expect(pkg1Info).toMatchAnalyzedSpec(
    expectedPkg1({ withCrossPackage: true })
  );

  // Add a JSON file to packageOne
  writeFileSync(FILE_JSON_NEW, '{}');
  updateCacheFromFileSystem({
    repoRootDir: packageOneSettings.repoRootDir,
    packageRootDir: packageOneSettings.packageRootDir,
    changes: {
      added: [{ filePath: FILE_JSON_NEW, latestUpdatedAt: Date.now() }],
      modified: [],
      deleted: [],
    },
    packageJsons: [],
    packageSettings: packageOneSettings,
    operationStart: Date.now(),
  });

  pkg1Info = getPackageInfo(PACKAGE_ONE_DIR);
  expect(pkg1Info).toMatchAnalyzedSpec(
    expectedPkg1({
      withCrossPackage: true,
      extras: { [FILE_JSON_NEW]: EXPECTED_OTHER_FILE },
    })
  );

  // packageTwo unchanged
  expect(getPackageInfo(PACKAGE_TWO_DIR)).toMatchAnalyzedSpec(EXPECTED_PKG2);

  // Modify the JSON file
  writeFileSync(FILE_JSON_NEW, `{ "foo": 10 }`);
  updateCacheFromFileSystem({
    repoRootDir: packageOneSettings.repoRootDir,
    packageRootDir: packageOneSettings.packageRootDir,
    changes: {
      added: [],
      modified: [{ filePath: FILE_JSON_NEW, latestUpdatedAt: Date.now() }],
      deleted: [],
    },
    packageJsons: [],
    packageSettings: packageOneSettings,
    operationStart: Date.now(),
  });

  pkg1Info = getPackageInfo(PACKAGE_ONE_DIR);
  expect(pkg1Info).toMatchAnalyzedSpec(
    expectedPkg1({
      withCrossPackage: true,
      extras: { [FILE_JSON_NEW]: EXPECTED_OTHER_FILE },
    })
  );

  // Delete the JSON file
  unlinkSync(FILE_JSON_NEW);
  updateCacheFromFileSystem({
    repoRootDir: packageOneSettings.repoRootDir,
    packageRootDir: packageOneSettings.packageRootDir,
    changes: {
      added: [],
      modified: [],
      deleted: [FILE_JSON_NEW],
    },
    packageJsons: [],
    packageSettings: packageOneSettings,
    operationStart: Date.now(),
  });

  pkg1Info = getPackageInfo(PACKAGE_ONE_DIR);
  expect(pkg1Info).toMatchAnalyzedSpec(
    expectedPkg1({ withCrossPackage: true })
  );
});

it('Cache update adds new cross-package singleImport', () => {
  const { packageTwoSettings } = initialize();

  // Add a brand-new packageTwo file that introduces a cross-package single
  // import of `AlsoOne`. After initializeRepo, packageOne/a.ts's `AlsoOne`
  // export has zero single importers (only a barrel importer from e.ts);
  // cache-update propagation should bring the count to one.
  const NEW_FILE_CONTENTS = `import type { AlsoOne } from '@test/package-one/a';

const n: AlsoOne = 1;
console.log(n);
`;
  updateCacheForFile({
    filePath: FILE_TS_NEW_PKG2,
    fileContents: NEW_FILE_CONTENTS,
    ast: parseContents(NEW_FILE_CONTENTS),
    packageSettings: packageTwoSettings,
  });

  const pkg1Info = getPackageInfo(PACKAGE_ONE_DIR);
  const fileA = pkg1Info.files.get(FILE_A);
  assertCodeFile(fileA, 'FILE_A missing or not a code file');

  const alsoOneExport = fileA.exports.find((e) => e.exportName === 'AlsoOne');
  assertDefined(alsoOneExport, 'AlsoOne export missing on FILE_A');
  const singleImporters = alsoOneExport.externallyImportedBy.filter(
    (e) => e.importEntry.type === 'singleImport'
  );
  expect(singleImporters).toHaveLength(1);
  expect(singleImporters[0]).toMatchObject({
    packageRootDir: PACKAGE_TWO_DIR,
    filePath: FILE_TS_NEW_PKG2,
    importEntry: { type: 'singleImport', importName: 'AlsoOne' },
  });

  // Regression guards for the `initializePackageInfo` duplication bug: total
  // length must match exactly and no (filePath, importEntry.type) pair may
  // appear more than once.
  expect(alsoOneExport.externallyImportedBy).toHaveLength(2);
  expectNoDuplicateExternalImporters(alsoOneExport.externallyImportedBy);

  const oneExport = fileA.exports.find((e) => e.exportName === 'One');
  assertDefined(oneExport, 'One export missing on FILE_A');
  expect(oneExport.externallyImportedBy).toHaveLength(2);
  expectNoDuplicateExternalImporters(oneExport.externallyImportedBy);

  // Re-export entries get externallyImportedBy pushes too, so phase 4 must
  // reset them on recompute just like it resets exports, or every recompute
  // appends a duplicate of the e.ts barrel importer.
  const nsReexport = fileA.barrelReexports.find((e) => e.exportName === 'ns');
  assertDefined(nsReexport, 'ns re-export missing on FILE_A');
  expect(nsReexport.externallyImportedBy).toHaveLength(1);
  expectNoDuplicateExternalImporters(nsReexport.externallyImportedBy);
});

it('Cache update on an existing file introduces a new cross-package singleImport', () => {
  const { packageTwoSettings } = initialize();

  // Before the update: full-shape check on both packages in their initial
  // cross-package state (d.ts single + e.ts barrel importers already wired).
  expect(getPackageInfo(PACKAGE_ONE_DIR)).toMatchAnalyzedSpec(
    expectedPkg1({ withCrossPackage: true })
  );
  expect(getPackageInfo(PACKAGE_TWO_DIR)).toMatchAnalyzedSpec(EXPECTED_PKG2);

  // Rewrite c.ts (packageTwo's entry point) to add a cross-package single
  // import of AlsoOne, while keeping its Two export. This is the
  // "edit existing file to introduce a cross-package import" case — distinct
  // from the "add new file" path covered by the next test.
  const NEW_C_CONTENTS = `// @ts-expect-error — cross-package import fixture
import type { AlsoOne } from '@test/package-one/a';
export type Two = AlsoOne;
`;
  updateCacheForFile({
    filePath: FILE_C,
    fileContents: NEW_C_CONTENTS,
    ast: parseContents(NEW_C_CONTENTS),
    packageSettings: packageTwoSettings,
  });

  const FILE_C_SINGLE_IMPORT = {
    type: 'singleImport' as const,
    importAlias: 'AlsoOne',
    importName: 'AlsoOne',
    isTypeImport: true,
    moduleSpecifier: '@test/package-one/a',
    resolvedModuleType: 'thirdParty' as const,
    rootModuleType: 'thirdParty' as const,
  };

  const EXPECTED_FILE_C_WITH_IMPORT: StrippedAnalyzedFileDetails = {
    fileType: 'code',
    entryPointSpecifier: '@test/package-two',
    isExternallyImported: false,
    singleImports: [FILE_C_SINGLE_IMPORT],
    barrelImports: [],
    dynamicImports: [],
    sideEffectImports: [],
    exports: [
      {
        type: 'export',
        exportName: 'Two',
        isTypeExport: true,
        importedBy: [],
        barrelImportedBy: [],
        externallyImportedBy: [],
        isEntryPoint: true,
        isExternallyImported: false,
      },
    ],
    singleReexports: [],
    barrelReexports: [],
  };

  const extraAlsoOneSingleImporters = [
    {
      packageRootDir: PACKAGE_TWO_DIR,
      filePath: FILE_C,
      importEntry: FILE_C_SINGLE_IMPORT,
    },
  ];

  // After the update:
  // - packageTwo's c.ts gains a singleImport of AlsoOne; the other packageTwo
  //   files are unchanged.
  // - packageOne's a.ts export of AlsoOne gains a new single importer alongside
  //   the existing e.ts barrel importer; One is unchanged.
  expect(getPackageInfo(PACKAGE_ONE_DIR)).toMatchAnalyzedSpec({
    [FILE_A]: buildExpectedFileA({
      withCrossPackage: true,
      extraAlsoOneSingleImporters,
    }),
    [FILE_B]: EXPECTED_FILE_B,
    [PKG1_CONFIG]: EXPECTED_OTHER_FILE,
    [PKG1_PACKAGE_JSON]: EXPECTED_OTHER_FILE,
  });
  expect(getPackageInfo(PACKAGE_TWO_DIR)).toMatchAnalyzedSpec({
    ...EXPECTED_PKG2,
    [FILE_C]: EXPECTED_FILE_C_WITH_IMPORT,
  });

  // Regression guards for the initializePackageInfo duplication bug.
  const pkg1Info = getPackageInfo(PACKAGE_ONE_DIR);
  const fileA = pkg1Info.files.get(FILE_A);
  assertCodeFile(fileA, 'FILE_A missing or not a code file');

  const alsoOneExport = fileA.exports.find((e) => e.exportName === 'AlsoOne');
  assertDefined(alsoOneExport, 'AlsoOne export missing on FILE_A');
  expectNoDuplicateExternalImporters(alsoOneExport.externallyImportedBy);

  const oneExport = fileA.exports.find((e) => e.exportName === 'One');
  assertDefined(oneExport, 'One export missing on FILE_A');
  expectNoDuplicateExternalImporters(oneExport.externallyImportedBy);

  const nsReexport = fileA.barrelReexports.find((e) => e.exportName === 'ns');
  assertDefined(nsReexport, 'ns re-export missing on FILE_A');
  expect(nsReexport.externallyImportedBy).toHaveLength(1);
  expectNoDuplicateExternalImporters(nsReexport.externallyImportedBy);
});

it('Cache update removes an existing cross-package singleImport', () => {
  const { packageTwoSettings } = initialize();

  // Remove d.ts's cross-package single import via updateCacheForFile. The
  // export on packageOne/a.ts should no longer list d.ts as an external
  // importer after cache-update propagation.
  const D_WITHOUT_IMPORT = `// @ts-expect-error — placeholder during test
const one: unknown = undefined;
console.log(one);
`;
  updateCacheForFile({
    filePath: FILE_D,
    fileContents: D_WITHOUT_IMPORT,
    ast: parseContents(D_WITHOUT_IMPORT),
    packageSettings: packageTwoSettings,
  });

  const pkg1Info = getPackageInfo(PACKAGE_ONE_DIR);
  const fileA = pkg1Info.files.get(FILE_A);
  assertCodeFile(fileA, 'FILE_A missing or not a code file');
  const oneExport = fileA.exports.find((e) => e.exportName === 'One');
  const singleImporters =
    oneExport?.externallyImportedBy.filter(
      (e) => e.importEntry.type === 'singleImport'
    ) ?? [];
  expect(singleImporters).toHaveLength(0);
});
