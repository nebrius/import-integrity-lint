import { join } from 'node:path';

import type { StrippedAnalyzedFileDetails } from '../../../../__test__/util.js';
import { computeAnalyzedInfo } from '../../../computeAnalyzedInfo.js';
import { computeBaseInfo } from '../../../computeBaseInfo.js';
import { computeResolvedInfo } from '../../../computeResolvedInfo.js';

const TEST_PACKAGE_DIR = join(import.meta.dirname, 'project', 'default');
const FILE_A = join(TEST_PACKAGE_DIR, 'a.ts');
const FILE_B = join(TEST_PACKAGE_DIR, 'b.ts');
const FILE_C = join(TEST_PACKAGE_DIR, 'c.ts');
const FILE_D = join(TEST_PACKAGE_DIR, 'd.ts');
const FILE_E = join(TEST_PACKAGE_DIR, 'e.ts');
const FILE_F = join(TEST_PACKAGE_DIR, 'f.ts');
const FILE_G = join(TEST_PACKAGE_DIR, 'g.ts');
const FILE_H = join(TEST_PACKAGE_DIR, 'h.json');
const FILE_PACKAGE_JSON = join(TEST_PACKAGE_DIR, 'package.json');

const CYCLE_FILE_A = join(TEST_PACKAGE_DIR, 'cycle-a.js');
const CYCLE_FILE_B = join(TEST_PACKAGE_DIR, 'cycle-b.js');
const CYCLE_FILE_C = join(TEST_PACKAGE_DIR, 'cycle-c.js');

const EXPECTED_FILE_A: StrippedAnalyzedFileDetails = {
  fileType: 'code',
  entryPointSpecifier: 'test',
  isExternallyImported: false,
  singleImports: [
    {
      type: 'singleImport',
      moduleSpecifier: './b',
      importName: 'c1',
      importAlias: 'c1',
      isTypeImport: false,
      resolvedModuleType: 'firstPartyCode',
      resolvedModulePath: FILE_B,
      rootModuleType: 'firstPartyCode',
      rootModulePath: FILE_C,
      rootExportEntry: {
        type: 'export',
        exportName: 'c1',
        isEntryPoint: false,
        isExternallyImported: false,
        isTypeExport: false,
      },
    },
    {
      type: 'singleImport',
      moduleSpecifier: './e',
      importName: 'd1',
      importAlias: 'd1',
      isTypeImport: false,
      resolvedModuleType: 'firstPartyCode',
      resolvedModulePath: FILE_E,
      rootModuleType: 'firstPartyCode',
      rootModulePath: FILE_D,
      rootExportEntry: {
        type: 'export',
        exportName: 'd1',
        isEntryPoint: false,
        isExternallyImported: false,
        isTypeExport: false,
      },
    },
    {
      type: 'singleImport',
      moduleSpecifier: './e',
      importName: 'f',
      importAlias: 'f',
      isTypeImport: false,
      resolvedModuleType: 'firstPartyCode',
      resolvedModulePath: FILE_E,
      rootModuleType: 'firstPartyCode',
      rootModulePath: FILE_E,
      rootExportEntry: {
        type: 'barrelReexport',
        isTypeReexport: false,
        exportName: 'f',
        isEntryPoint: false,
        isExternallyImported: false,
        moduleSpecifier: './f',
        resolvedModulePath: FILE_F,
        resolvedModuleType: 'firstPartyCode',
      },
    },
    {
      type: 'singleImport',
      moduleSpecifier: './f',
      importName: 'join',
      importAlias: 'join',
      isTypeImport: false,
      resolvedModulePath: FILE_F,
      resolvedModuleType: 'firstPartyCode',
      rootModuleType: 'builtin',
    },
    {
      type: 'singleImport',
      moduleSpecifier: './g?raw',
      importName: 'SourceCode',
      importAlias: 'SourceCode',
      isTypeImport: false,
      resolvedModulePath: FILE_G,
      resolvedModuleType: 'firstPartyCode',
      rootModuleType: undefined,
    },
    {
      type: 'singleImport',
      importAlias: 'h',
      importName: 'default',
      isTypeImport: false,
      moduleSpecifier: './h.json',
      resolvedModuleType: 'firstPartyOther',
      resolvedModulePath: FILE_H,
      rootModuleType: undefined,
    },
  ],
  barrelImports: [
    {
      type: 'barrelImport',
      isTypeImport: false,
      importAlias: 'b',
      moduleSpecifier: './b',
      resolvedModuleType: 'firstPartyCode',
      resolvedModulePath: FILE_B,
    },
  ],
  dynamicImports: [],
  sideEffectImports: [],
  exports: [],
  singleReexports: [
    {
      type: 'singleReexport',
      exportName: 'ASourceCode',
      importName: 'SourceCode',
      importedBy: [],
      barrelImportedBy: [],
      externallyImportedBy: [],
      isEntryPoint: true,
      isExternallyImported: false,
      isTypeReexport: true,
      moduleSpecifier: './f',
      resolvedModuleType: 'firstPartyCode',
      resolvedModulePath: FILE_F,
      rootModuleType: 'thirdParty',
    },
  ],
  barrelReexports: [],
};

const EXPECTED_FILE_B: StrippedAnalyzedFileDetails = {
  fileType: 'code',
  entryPointSpecifier: undefined,
  isExternallyImported: false,
  singleImports: [],
  barrelImports: [],
  dynamicImports: [],
  sideEffectImports: [],
  exports: [],
  singleReexports: [],
  barrelReexports: [
    {
      type: 'barrelReexport',
      isTypeReexport: false,
      moduleSpecifier: './c',
      exportName: undefined,
      isEntryPoint: false,
      isExternallyImported: false,
      resolvedModuleType: 'firstPartyCode',
      resolvedModulePath: FILE_C,
      // a.ts's `import { c1 } from './b'` resolves through this `export *`,
      // so the statement that supplies the name is recorded as imported.
      importedBy: [
        {
          filePath: FILE_A,
          importEntry: {
            type: 'singleImport',
            moduleSpecifier: './b',
            importName: 'c1',
            importAlias: 'c1',
            isTypeImport: false,
            resolvedModuleType: 'firstPartyCode',
            resolvedModulePath: FILE_B,
            rootModuleType: 'firstPartyCode',
            rootModulePath: FILE_C,
          },
        },
      ],
      // a.ts's `import * as b from './b'` reaches every member of b's
      // namespace, including its re-export statements.
      barrelImportedBy: [
        {
          filePath: FILE_A,
          importEntry: {
            type: 'barrelImport',
            isTypeImport: false,
            moduleSpecifier: './b',
            importAlias: 'b',
            resolvedModuleType: 'firstPartyCode',
            resolvedModulePath: FILE_B,
          },
        },
      ],
      externallyImportedBy: [],
    },
    {
      type: 'barrelReexport',
      isTypeReexport: false,
      moduleSpecifier: './d',
      exportName: undefined,
      isEntryPoint: false,
      isExternallyImported: false,
      resolvedModuleType: 'firstPartyCode',
      resolvedModulePath: FILE_D,
      // d1 is imported through e.ts, not through this `export *`, so no
      // by-name import passes through here.
      importedBy: [],
      barrelImportedBy: [
        {
          filePath: FILE_A,
          importEntry: {
            type: 'barrelImport',
            isTypeImport: false,
            moduleSpecifier: './b',
            importAlias: 'b',
            resolvedModuleType: 'firstPartyCode',
            resolvedModulePath: FILE_B,
          },
        },
      ],
      externallyImportedBy: [],
    },
  ],
};

const EXPECTED_FILE_C: StrippedAnalyzedFileDetails = {
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
      exportName: 'c1',
      isEntryPoint: false,
      isExternallyImported: false,
      isTypeExport: false,
      importedBy: [
        {
          filePath: FILE_A,
          importEntry: {
            type: 'singleImport',
            moduleSpecifier: './b',
            importName: 'c1',
            importAlias: 'c1',
            isTypeImport: false,
            resolvedModuleType: 'firstPartyCode',
            resolvedModulePath: FILE_B,
            rootModuleType: 'firstPartyCode',
            rootModulePath: FILE_C,
          },
        },
      ],
      barrelImportedBy: [
        {
          filePath: FILE_A,
          importEntry: {
            type: 'barrelImport',
            isTypeImport: false,
            moduleSpecifier: './b',
            importAlias: 'b',
            resolvedModuleType: 'firstPartyCode',
            resolvedModulePath: FILE_B,
          },
        },
      ],
      externallyImportedBy: [],
    },
  ],
  singleReexports: [],
  barrelReexports: [],
};

const EXPECTED_CYCLE_FILE_A: StrippedAnalyzedFileDetails = {
  entryPointSpecifier: undefined,
  isExternallyImported: false,
  exports: [],
  fileType: 'code',
  singleImports: [],
  barrelImports: [],
  dynamicImports: [],
  sideEffectImports: [],
  singleReexports: [
    {
      type: 'singleReexport',
      exportName: 'a',
      importName: 'a',
      importedBy: [],
      barrelImportedBy: [],
      externallyImportedBy: [],
      isEntryPoint: false,
      isExternallyImported: false,
      isTypeReexport: false,
      moduleSpecifier: './cycle-b',
      resolvedModuleType: 'firstPartyCode',
      resolvedModulePath: CYCLE_FILE_B,
      rootModuleType: undefined,
    },
  ],
  barrelReexports: [],
};

const EXPECTED_CYCLE_FILE_B: StrippedAnalyzedFileDetails = {
  entryPointSpecifier: undefined,
  isExternallyImported: false,
  exports: [],
  fileType: 'code',
  singleImports: [],
  barrelImports: [],
  dynamicImports: [],
  sideEffectImports: [],
  singleReexports: [
    {
      type: 'singleReexport',
      exportName: 'a',
      importName: 'a',
      importedBy: [],
      barrelImportedBy: [],
      externallyImportedBy: [],
      isEntryPoint: false,
      isExternallyImported: false,
      isTypeReexport: false,
      moduleSpecifier: './cycle-c',
      resolvedModuleType: 'firstPartyCode',
      resolvedModulePath: CYCLE_FILE_C,
      rootModuleType: undefined,
    },
  ],
  barrelReexports: [],
};

const EXPECTED_CYCLE_FILE_C: StrippedAnalyzedFileDetails = {
  entryPointSpecifier: undefined,
  isExternallyImported: false,
  exports: [],
  fileType: 'code',
  singleImports: [],
  barrelImports: [],
  dynamicImports: [],
  sideEffectImports: [],
  singleReexports: [
    {
      type: 'singleReexport',
      exportName: 'a',
      importName: 'a',
      importedBy: [],
      barrelImportedBy: [],
      externallyImportedBy: [],
      isEntryPoint: false,
      isExternallyImported: false,
      isTypeReexport: false,
      moduleSpecifier: './cycle-a',
      resolvedModuleType: 'firstPartyCode',
      resolvedModulePath: CYCLE_FILE_A,
      rootModuleType: undefined,
    },
  ],
  barrelReexports: [],
};

const EXPECTED_FILE_D: StrippedAnalyzedFileDetails = {
  entryPointSpecifier: undefined,
  isExternallyImported: false,
  fileType: 'code',
  singleImports: [],
  barrelImports: [],
  dynamicImports: [],
  sideEffectImports: [],
  exports: [
    {
      type: 'export',
      exportName: 'd1',
      isEntryPoint: false,
      isExternallyImported: false,
      isTypeExport: false,
      importedBy: [
        {
          filePath: FILE_A,
          importEntry: {
            type: 'singleImport',
            moduleSpecifier: './e',
            importName: 'd1',
            importAlias: 'd1',
            isTypeImport: false,
            resolvedModuleType: 'firstPartyCode',
            resolvedModulePath: FILE_E,
            rootModuleType: 'firstPartyCode',
            rootModulePath: FILE_D,
          },
        },
      ],
      barrelImportedBy: [
        {
          filePath: FILE_A,
          importEntry: {
            type: 'barrelImport',
            isTypeImport: false,
            moduleSpecifier: './b',
            importAlias: 'b',
            resolvedModuleType: 'firstPartyCode',
            resolvedModulePath: FILE_B,
          },
        },
      ],
      externallyImportedBy: [],
    },
  ],
  singleReexports: [],
  barrelReexports: [],
};

const EXPECTED_FILE_E: StrippedAnalyzedFileDetails = {
  entryPointSpecifier: undefined,
  isExternallyImported: false,
  fileType: 'code',
  singleImports: [],
  barrelImports: [],
  dynamicImports: [],
  sideEffectImports: [],
  exports: [],
  singleReexports: [
    {
      type: 'singleReexport',
      moduleSpecifier: './d',
      importName: 'd1',
      exportName: 'd1',
      isTypeReexport: false,
      isEntryPoint: false,
      isExternallyImported: false,
      resolvedModuleType: 'firstPartyCode',
      resolvedModulePath: FILE_D,
      importedBy: [
        {
          filePath: FILE_A,
          importEntry: {
            type: 'singleImport',
            moduleSpecifier: './e',
            importName: 'd1',
            importAlias: 'd1',
            isTypeImport: false,
            resolvedModuleType: 'firstPartyCode',
            resolvedModulePath: FILE_E,
            rootModuleType: 'firstPartyCode',
            rootModulePath: FILE_D,
          },
        },
      ],
      barrelImportedBy: [],
      externallyImportedBy: [],
      rootModuleType: undefined,
    },
  ],
  barrelReexports: [
    {
      type: 'barrelReexport',
      isTypeReexport: false,
      moduleSpecifier: './f',
      exportName: 'f',
      isEntryPoint: false,
      isExternallyImported: false,
      resolvedModuleType: 'firstPartyCode',
      resolvedModulePath: FILE_F,
      importedBy: [
        {
          filePath: FILE_A,
          importEntry: {
            type: 'singleImport',
            moduleSpecifier: './e',
            importName: 'f',
            importAlias: 'f',
            isTypeImport: false,
            resolvedModuleType: 'firstPartyCode',
            resolvedModulePath: FILE_E,
            rootModuleType: 'firstPartyCode',
            rootModulePath: FILE_E,
          },
        },
      ],
      barrelImportedBy: [],
      externallyImportedBy: [],
    },
  ],
};

const EXPECTED_FILE_F: StrippedAnalyzedFileDetails = {
  entryPointSpecifier: undefined,
  isExternallyImported: false,
  fileType: 'code',
  singleImports: [],
  barrelImports: [],
  dynamicImports: [],
  sideEffectImports: [],
  exports: [],
  singleReexports: [
    {
      type: 'singleReexport',
      moduleSpecifier: 'path',
      importName: 'join',
      exportName: 'join',
      isTypeReexport: false,
      isEntryPoint: false,
      isExternallyImported: false,
      resolvedModuleType: 'builtin',
      // a.ts's `import { join } from './f'` lands on this re-export; the
      // target being a builtin does not make the re-export itself unused.
      importedBy: [
        {
          filePath: FILE_A,
          importEntry: {
            type: 'singleImport',
            moduleSpecifier: './f',
            importName: 'join',
            importAlias: 'join',
            isTypeImport: false,
            resolvedModulePath: FILE_F,
            resolvedModuleType: 'firstPartyCode',
            rootModuleType: 'builtin',
          },
        },
      ],
      // a.ts's `import { f } from './e'` resolves to `export * as f from
      // './f'`, whose namespace includes every re-export in f.ts.
      barrelImportedBy: [
        {
          filePath: FILE_A,
          importEntry: {
            type: 'singleImport',
            moduleSpecifier: './e',
            importName: 'f',
            importAlias: 'f',
            isTypeImport: false,
            resolvedModuleType: 'firstPartyCode',
            resolvedModulePath: FILE_E,
            rootModuleType: 'firstPartyCode',
            rootModulePath: FILE_E,
          },
        },
      ],
      externallyImportedBy: [],
      rootModuleType: 'builtin',
    },
    {
      type: 'singleReexport',
      exportName: 'SourceCode',
      importName: 'SourceCode',
      // a.ts's entry-point `export type { SourceCode as ASourceCode } from
      // './f'` acts as an import of this re-export.
      importedBy: [
        {
          filePath: FILE_A,
          importEntry: {
            type: 'singleReexport',
            exportName: 'ASourceCode',
            importName: 'SourceCode',
            isEntryPoint: true,
            isExternallyImported: false,
            isTypeReexport: true,
            moduleSpecifier: './f',
            resolvedModuleType: 'firstPartyCode',
            resolvedModulePath: FILE_F,
            rootModuleType: 'thirdParty',
          },
        },
      ],
      barrelImportedBy: [
        {
          filePath: FILE_A,
          importEntry: {
            type: 'singleImport',
            moduleSpecifier: './e',
            importName: 'f',
            importAlias: 'f',
            isTypeImport: false,
            resolvedModuleType: 'firstPartyCode',
            resolvedModulePath: FILE_E,
            rootModuleType: 'firstPartyCode',
            rootModulePath: FILE_E,
          },
        },
      ],
      externallyImportedBy: [],
      isEntryPoint: false,
      isExternallyImported: false,
      isTypeReexport: true,
      moduleSpecifier: 'eslint',
      resolvedModuleType: 'thirdParty',
      rootModuleType: 'thirdParty',
    },
  ],
  barrelReexports: [],
};

const EXPECTED_FILE_G: StrippedAnalyzedFileDetails = {
  entryPointSpecifier: undefined,
  isExternallyImported: false,
  fileType: 'code',
  singleImports: [],
  barrelImports: [],
  dynamicImports: [],
  sideEffectImports: [],
  exports: [],
  singleReexports: [],
  barrelReexports: [
    {
      type: 'barrelReexport',
      isTypeReexport: false,
      moduleSpecifier: 'eslint',
      exportName: undefined,
      isEntryPoint: false,
      isExternallyImported: false,
      resolvedModuleType: 'thirdParty',
      importedBy: [],
      barrelImportedBy: [],
      externallyImportedBy: [],
    },
  ],
};

const EXPECTED_FILE_H: StrippedAnalyzedFileDetails = {
  fileType: 'other',
};

const EXPECTED_FILE_PACKAGE_JSON: StrippedAnalyzedFileDetails = {
  fileType: 'other',
};

const EXPECTED = {
  [FILE_A]: EXPECTED_FILE_A,
  [FILE_B]: EXPECTED_FILE_B,
  [FILE_C]: EXPECTED_FILE_C,
  [FILE_D]: EXPECTED_FILE_D,
  [FILE_E]: EXPECTED_FILE_E,
  [FILE_F]: EXPECTED_FILE_F,
  [FILE_G]: EXPECTED_FILE_G,
  [FILE_H]: EXPECTED_FILE_H,
  [FILE_PACKAGE_JSON]: EXPECTED_FILE_PACKAGE_JSON,
  [CYCLE_FILE_A]: EXPECTED_CYCLE_FILE_A,
  [CYCLE_FILE_B]: EXPECTED_CYCLE_FILE_B,
  [CYCLE_FILE_C]: EXPECTED_CYCLE_FILE_C,
};

it('Computes analyzed info', () => {
  const info = computeAnalyzedInfo(
    computeResolvedInfo(
      computeBaseInfo({
        packageRootDir: TEST_PACKAGE_DIR,
        packageName: 'test',
        wildcardAliases: {},
        fixedAliases: {},
        ignorePatterns: [],
        ignoreOverridePatterns: [],
        defaultIgnoreOverrides: [],
        getEntryPointSpecifier: (filePath) =>
          filePath === FILE_A ? 'test' : undefined,
        isExternallyImportedCheck: () => false,
      })
    )
  );
  // This lookup gets two package.json files: this test and the root import-integrity
  // package.json. We only look at the test package's dependencies in this test.
  expect(info.availableThirdPartyDependencies.size).toBe(2);
  expect(info.availableThirdPartyDependencies.get(TEST_PACKAGE_DIR)).toEqual([
    'typescript',
  ]);

  // The map is keyed by the entry point's module specifier, holds the exact
  // same AnalyzedCodeFileDetails instance that appears in `files`, and that
  // instance's `entryPointSpecifier` must round-trip back to the map key.
  expect([...info.packageEntryPointExports.keys()]).toEqual(['test']);
  const registeredFileA = info.packageEntryPointExports.get('test');
  expect(registeredFileA).toBe(info.files.get(FILE_A));
  expect(registeredFileA?.entryPointSpecifier).toBe('test');

  expect(info.packageName).toEqual('test');
  expect(info.packageRootDir).toEqual(TEST_PACKAGE_DIR);
  expect(info).toMatchAnalyzedSpec(EXPECTED);
});

it('Computes analyzed info for a package with a file that imports itself', () => {
  const selfImportPackageDir = join(
    import.meta.dirname,
    'project',
    'self-import'
  );
  expect(() =>
    computeAnalyzedInfo(
      computeResolvedInfo(
        computeBaseInfo({
          packageRootDir: selfImportPackageDir,
          packageName: 'test',
          wildcardAliases: {},
          fixedAliases: {},
          ignorePatterns: [],
          ignoreOverridePatterns: [],
          defaultIgnoreOverrides: [],
          getEntryPointSpecifier: () => undefined,
          isExternallyImportedCheck: () => false,
        })
      )
    )
  ).not.toThrow();
});

it('Computes analyzed info for a package with a reexport cycle triggered by an entry point', () => {
  const reexportCyclePackageDir = join(
    import.meta.dirname,
    'project',
    'reexport-cycle'
  );
  const fileA = join(reexportCyclePackageDir, 'a.ts');
  expect(() =>
    computeAnalyzedInfo(
      computeResolvedInfo(
        computeBaseInfo({
          packageRootDir: reexportCyclePackageDir,
          packageName: 'test',
          wildcardAliases: {},
          fixedAliases: {},
          ignorePatterns: [],
          ignoreOverridePatterns: [],
          defaultIgnoreOverrides: [],
          getEntryPointSpecifier: (filePath) =>
            filePath === fileA ? 'test' : undefined,
          isExternallyImportedCheck: () => false,
        })
      )
    )
  ).not.toThrow();
});

it('Computes analyzed info for a package with a reexport cycle triggered by an import', () => {
  const reexportCyclePackageDir = join(
    import.meta.dirname,
    'project',
    'reexport-cycle-import'
  );
  expect(() =>
    computeAnalyzedInfo(
      computeResolvedInfo(
        computeBaseInfo({
          packageRootDir: reexportCyclePackageDir,
          packageName: 'test',
          wildcardAliases: {},
          fixedAliases: {},
          ignorePatterns: [],
          ignoreOverridePatterns: [],
          defaultIgnoreOverrides: [],
          getEntryPointSpecifier: () => undefined,
          isExternallyImportedCheck: () => false,
        })
      )
    )
  ).not.toThrow();
});

it('Computes analyzed info for a package with a single reexport of a firstPartyOther module', () => {
  const packageRootDir = join(
    import.meta.dirname,
    'project',
    'single-reexport-of-other'
  );
  expect(() =>
    computeAnalyzedInfo(
      computeResolvedInfo(
        computeBaseInfo({
          packageRootDir,
          packageName: 'test',
          wildcardAliases: {},
          fixedAliases: {},
          ignorePatterns: [],
          ignoreOverridePatterns: [],
          defaultIgnoreOverrides: [],
          getEntryPointSpecifier: () => undefined,
          isExternallyImportedCheck: () => false,
        })
      )
    )
  ).not.toThrow();
});

it('Computes analyzed info for a package with a named barrel reexport of a builtin module', () => {
  const packageRootDir = join(
    import.meta.dirname,
    'project',
    'named-barrel-reexport-of-builtin'
  );
  expect(() =>
    computeAnalyzedInfo(
      computeResolvedInfo(
        computeBaseInfo({
          packageRootDir,
          packageName: 'test',
          wildcardAliases: {},
          fixedAliases: {},
          ignorePatterns: [],
          ignoreOverridePatterns: [],
          defaultIgnoreOverrides: [],
          getEntryPointSpecifier: () => undefined,
          isExternallyImportedCheck: () => false,
        })
      )
    )
  ).not.toThrow();
});

it('Computes analyzed info for a package with a named barrel reexport of a firstPartyOther module', () => {
  const packageRootDir = join(
    import.meta.dirname,
    'project',
    'named-barrel-reexport-of-other'
  );
  expect(() =>
    computeAnalyzedInfo(
      computeResolvedInfo(
        computeBaseInfo({
          packageRootDir,
          packageName: 'test',
          wildcardAliases: {},
          fixedAliases: {},
          ignorePatterns: [],
          ignoreOverridePatterns: [],
          defaultIgnoreOverrides: [],
          getEntryPointSpecifier: () => undefined,
          isExternallyImportedCheck: () => false,
        })
      )
    )
  ).not.toThrow();
});

it('Computes analyzed info for a package with a dynamic import', () => {
  const packageRootDir = join(import.meta.dirname, 'project', 'dynamic-import');
  expect(() =>
    computeAnalyzedInfo(
      computeResolvedInfo(
        computeBaseInfo({
          packageRootDir,
          packageName: 'test',
          wildcardAliases: {},
          fixedAliases: {},
          ignorePatterns: [],
          ignoreOverridePatterns: [],
          defaultIgnoreOverrides: [],
          getEntryPointSpecifier: () => undefined,
          isExternallyImportedCheck: () => false,
        })
      )
    )
  ).not.toThrow();
});

it('Computes analyzed info for a package with a side-effect import', () => {
  const packageRootDir = join(
    import.meta.dirname,
    'project',
    'side-effect-import'
  );
  expect(() =>
    computeAnalyzedInfo(
      computeResolvedInfo(
        computeBaseInfo({
          packageRootDir,
          packageName: 'test',
          wildcardAliases: {},
          fixedAliases: {},
          ignorePatterns: [],
          ignoreOverridePatterns: [],
          defaultIgnoreOverrides: [],
          getEntryPointSpecifier: () => undefined,
          isExternallyImportedCheck: () => false,
        })
      )
    )
  ).not.toThrow();
});

it('Computes analyzed info for a package with a barrel reexport that is an entry point and forms a cycle', () => {
  const packageRootDir = join(
    import.meta.dirname,
    'project',
    'barrel-reexport-entry-point'
  );
  const fileA = join(packageRootDir, 'a.ts');
  expect(() =>
    computeAnalyzedInfo(
      computeResolvedInfo(
        computeBaseInfo({
          packageRootDir,
          packageName: 'test',
          wildcardAliases: {},
          fixedAliases: {},
          ignorePatterns: [],
          ignoreOverridePatterns: [],
          defaultIgnoreOverrides: [],
          getEntryPointSpecifier: (filePath) =>
            filePath === fileA ? 'test' : undefined,
          isExternallyImportedCheck: () => false,
        })
      )
    )
  ).not.toThrow();
});

// Reachability through barrels: `importedBy` / `barrelImportedBy` must record
// exactly the entries an import can reach, by name or through a namespace
// object, including the re-export statements along the way, and nothing more.
const BARREL_DIR = join(import.meta.dirname, 'project', 'barrel-reachability');
const BARREL_ENTRY_STAR = join(BARREL_DIR, 'entry-star.ts');
const BARREL_STAR_IMPL = join(BARREL_DIR, 'star-impl.ts');
const BARREL_ENTRY_NS = join(BARREL_DIR, 'entry-ns.ts');
const BARREL_NS_IMPL = join(BARREL_DIR, 'ns-impl.ts');
const BARREL_CONSUMER = join(BARREL_DIR, 'consumer.ts');
const BARREL_IMPL = join(BARREL_DIR, 'barrel-impl.ts');
const BARREL_ENTRY_CHAIN = join(BARREL_DIR, 'entry-chain.ts');
const BARREL_CHAIN_MID = join(BARREL_DIR, 'chain-mid.ts');
const BARREL_CHAIN_IMPL = join(BARREL_DIR, 'chain-impl.ts');
const BARREL_DEF_CONSUMER = join(BARREL_DIR, 'def-consumer.ts');
const BARREL_DUP_CONSUMER = join(BARREL_DIR, 'dup-consumer.ts');
const BARREL_DUP_BARREL = join(BARREL_DIR, 'dup-barrel.ts');
const BARREL_DUP_IMPL = join(BARREL_DIR, 'dup-impl.ts');
const BARREL_REVISIT_CONSUMER = join(BARREL_DIR, 'revisit-consumer.ts');
const BARREL_REVISIT_BARREL = join(BARREL_DIR, 'revisit-barrel.ts');
const BARREL_REVISIT_IMPL = join(BARREL_DIR, 'revisit-impl.ts');
const BARREL_SIBLING_CONSUMER = join(BARREL_DIR, 'sibling-consumer.ts');
const BARREL_SIBLING_BARREL = join(BARREL_DIR, 'sibling-barrel.ts');
const BARREL_SIBLING_RENAME = join(BARREL_DIR, 'sibling-rename.ts');
const BARREL_SIBLING_IMPL = join(BARREL_DIR, 'sibling-impl.ts');
const BARREL_NODEFAULT_CONSUMER = join(BARREL_DIR, 'nodefault-consumer.ts');
const BARREL_NODEFAULT_BARREL = join(BARREL_DIR, 'nodefault-barrel.ts');
const BARREL_NODEFAULT_SINGLE = join(BARREL_DIR, 'nodefault-single.ts');
const BARREL_NODEFAULT_NS = join(BARREL_DIR, 'nodefault-ns.ts');
const BARREL_NODEFAULT_IMPL = join(BARREL_DIR, 'nodefault-impl.ts');
const BARREL_UNSEEN_CONSUMER = join(BARREL_DIR, 'unseen-consumer.ts');
const BARREL_UNSEEN_BARREL = join(BARREL_DIR, 'unseen-barrel.ts');
const BARREL_UNSEEN_PRECEDENCE = join(BARREL_DIR, 'unseen-precedence.ts');
const BARREL_UNSEEN_IMPL = join(BARREL_DIR, 'unseen-impl.ts');
const BARREL_CYCLE_CONSUMER = join(BARREL_DIR, 'cycle-consumer.ts');
const BARREL_CYCLE_BARREL = join(BARREL_DIR, 'cycle-barrel.ts');
const BARREL_CYCLE_RENAME = join(BARREL_DIR, 'cycle-rename.ts');

const BARREL_ENTRY_POINTS = new Map([
  [BARREL_ENTRY_STAR, 'test/star'],
  [BARREL_ENTRY_NS, 'test/ns'],
  [BARREL_ENTRY_CHAIN, 'test/chain'],
]);

// The origins, as they appear once the matcher has stripped them.
const ORIGIN_ENTRY_STAR = {
  type: 'barrelReexport' as const,
  isTypeReexport: false,
  moduleSpecifier: './star-impl',
  exportName: undefined,
  isEntryPoint: true,
  isExternallyImported: false,
  resolvedModuleType: 'firstPartyCode' as const,
  resolvedModulePath: BARREL_STAR_IMPL,
};
const ORIGIN_ENTRY_NS = {
  type: 'barrelReexport' as const,
  isTypeReexport: false,
  moduleSpecifier: './ns-impl',
  exportName: 'ns',
  isEntryPoint: true,
  isExternallyImported: false,
  resolvedModuleType: 'firstPartyCode' as const,
  resolvedModulePath: BARREL_NS_IMPL,
};
const ORIGIN_CONSUMER = {
  type: 'barrelImport' as const,
  isTypeImport: false,
  moduleSpecifier: './barrel-impl',
  importAlias: 'b',
  resolvedModuleType: 'firstPartyCode' as const,
  resolvedModulePath: BARREL_IMPL,
};
const ORIGIN_ENTRY_CHAIN = {
  type: 'barrelReexport' as const,
  isTypeReexport: false,
  moduleSpecifier: './chain-mid',
  exportName: undefined,
  isEntryPoint: true,
  isExternallyImported: false,
  resolvedModuleType: 'firstPartyCode' as const,
  resolvedModulePath: BARREL_CHAIN_MID,
};
const ORIGIN_DUP_CONSUMER = {
  type: 'barrelImport' as const,
  isTypeImport: false,
  moduleSpecifier: './dup-barrel',
  importAlias: 'd',
  resolvedModuleType: 'firstPartyCode' as const,
  resolvedModulePath: BARREL_DUP_BARREL,
};
const ORIGIN_REVISIT_CONSUMER = {
  type: 'barrelImport' as const,
  isTypeImport: false,
  moduleSpecifier: './revisit-barrel',
  importAlias: 'r',
  resolvedModuleType: 'firstPartyCode' as const,
  resolvedModulePath: BARREL_REVISIT_BARREL,
};
const ORIGIN_SIBLING_CONSUMER = {
  type: 'singleImport' as const,
  moduleSpecifier: './sibling-barrel',
  importName: 'siblingFn',
  importAlias: 'siblingFn',
  isTypeImport: false,
  resolvedModuleType: 'firstPartyCode' as const,
  resolvedModulePath: BARREL_SIBLING_BARREL,
  rootModuleType: 'firstPartyCode' as const,
  rootModulePath: BARREL_SIBLING_IMPL,
};
const ORIGIN_NODEFAULT_CONSUMER = {
  type: 'barrelImport' as const,
  isTypeImport: false,
  moduleSpecifier: './nodefault-barrel',
  importAlias: 'n',
  resolvedModuleType: 'firstPartyCode' as const,
  resolvedModulePath: BARREL_NODEFAULT_BARREL,
};
const ORIGIN_UNSEEN_CONSUMER = {
  type: 'singleImport' as const,
  moduleSpecifier: './unseen-barrel',
  importName: 'unseenFn',
  importAlias: 'unseenFn',
  isTypeImport: false,
  resolvedModuleType: 'firstPartyCode' as const,
  resolvedModulePath: BARREL_UNSEEN_BARREL,
  rootModuleType: 'firstPartyOther' as const,
  rootModulePath: undefined,
};
const ORIGIN_UNSEEN_PRECEDENCE_CONSUMER = {
  type: 'singleImport' as const,
  moduleSpecifier: './unseen-precedence',
  importName: 'visibleFn',
  importAlias: 'visibleFn',
  isTypeImport: false,
  resolvedModuleType: 'firstPartyCode' as const,
  resolvedModulePath: BARREL_UNSEEN_PRECEDENCE,
  rootModuleType: 'firstPartyCode' as const,
  rootModulePath: BARREL_UNSEEN_IMPL,
};
const ORIGIN_CYCLE_CONSUMER = {
  type: 'singleImport' as const,
  moduleSpecifier: './cycle-barrel',
  importName: 'cycleAlias',
  importAlias: 'cycleAlias',
  isTypeImport: false,
  resolvedModuleType: 'firstPartyCode' as const,
  resolvedModulePath: BARREL_CYCLE_BARREL,
  rootModuleType: 'firstPartyCode' as const,
  rootModulePath: BARREL_CYCLE_RENAME,
};

const EMPTY_LISTS = {
  importedBy: [],
  barrelImportedBy: [],
  externallyImportedBy: [],
};
const NO_IMPORTS = {
  singleImports: [],
  barrelImports: [],
  dynamicImports: [],
  sideEffectImports: [],
};

const EXPECTED_BARREL_REACHABILITY: Record<
  string,
  StrippedAnalyzedFileDetails
> = {
  // Entry-point `export *`: everything in star-impl except its default
  // export is reachable, because `export *` never forwards `default`.
  [BARREL_ENTRY_STAR]: {
    fileType: 'code',
    entryPointSpecifier: 'test/star',
    isExternallyImported: false,
    ...NO_IMPORTS,
    exports: [],
    singleReexports: [],
    barrelReexports: [{ ...ORIGIN_ENTRY_STAR, ...EMPTY_LISTS }],
  },
  [BARREL_STAR_IMPL]: {
    fileType: 'code',
    entryPointSpecifier: undefined,
    isExternallyImported: false,
    ...NO_IMPORTS,
    exports: [
      {
        type: 'export',
        exportName: 'starFn',
        isEntryPoint: false,
        isExternallyImported: false,
        isTypeExport: false,
        importedBy: [],
        barrelImportedBy: [
          { filePath: BARREL_ENTRY_STAR, importEntry: ORIGIN_ENTRY_STAR },
        ],
        externallyImportedBy: [],
      },
      {
        type: 'export',
        exportName: 'default',
        isEntryPoint: false,
        isExternallyImported: false,
        isTypeExport: false,
        ...EMPTY_LISTS,
      },
    ],
    singleReexports: [],
    barrelReexports: [],
  },

  // Entry-point `export * as ns`: the namespace object includes `default`.
  [BARREL_ENTRY_NS]: {
    fileType: 'code',
    entryPointSpecifier: 'test/ns',
    isExternallyImported: false,
    ...NO_IMPORTS,
    exports: [],
    singleReexports: [],
    barrelReexports: [{ ...ORIGIN_ENTRY_NS, ...EMPTY_LISTS }],
  },
  [BARREL_NS_IMPL]: {
    fileType: 'code',
    entryPointSpecifier: undefined,
    isExternallyImported: false,
    ...NO_IMPORTS,
    exports: [
      {
        type: 'export',
        exportName: 'nsFn',
        isEntryPoint: false,
        isExternallyImported: false,
        isTypeExport: false,
        importedBy: [],
        barrelImportedBy: [
          { filePath: BARREL_ENTRY_NS, importEntry: ORIGIN_ENTRY_NS },
        ],
        externallyImportedBy: [],
      },
      {
        type: 'export',
        exportName: 'default',
        isEntryPoint: false,
        isExternallyImported: false,
        isTypeExport: false,
        importedBy: [],
        barrelImportedBy: [
          { filePath: BARREL_ENTRY_NS, importEntry: ORIGIN_ENTRY_NS },
        ],
        externallyImportedBy: [],
      },
    ],
    singleReexports: [],
    barrelReexports: [],
  },

  // Plain `import * as b` in a regular file.
  [BARREL_CONSUMER]: {
    fileType: 'code',
    entryPointSpecifier: undefined,
    isExternallyImported: false,
    singleImports: [],
    barrelImports: [ORIGIN_CONSUMER],
    dynamicImports: [],
    sideEffectImports: [],
    exports: [],
    singleReexports: [],
    barrelReexports: [],
  },
  [BARREL_IMPL]: {
    fileType: 'code',
    entryPointSpecifier: undefined,
    isExternallyImported: false,
    ...NO_IMPORTS,
    exports: [
      {
        type: 'export',
        exportName: 'barrelFn',
        isEntryPoint: false,
        isExternallyImported: false,
        isTypeExport: false,
        importedBy: [],
        barrelImportedBy: [
          { filePath: BARREL_CONSUMER, importEntry: ORIGIN_CONSUMER },
        ],
        externallyImportedBy: [],
      },
    ],
    singleReexports: [],
    barrelReexports: [],
  },

  // Entry-point `export *` landing on a named re-export one level down. The
  // re-export statement itself is reachable, and through it only the one
  // export it names: chainOther is not part of the namespace.
  [BARREL_ENTRY_CHAIN]: {
    fileType: 'code',
    entryPointSpecifier: 'test/chain',
    isExternallyImported: false,
    ...NO_IMPORTS,
    exports: [],
    singleReexports: [],
    barrelReexports: [{ ...ORIGIN_ENTRY_CHAIN, ...EMPTY_LISTS }],
  },
  [BARREL_CHAIN_MID]: {
    fileType: 'code',
    entryPointSpecifier: undefined,
    isExternallyImported: false,
    ...NO_IMPORTS,
    exports: [],
    singleReexports: [
      {
        type: 'singleReexport',
        moduleSpecifier: './chain-impl',
        importName: 'chainFn',
        exportName: 'chainFn',
        isTypeReexport: false,
        isEntryPoint: false,
        isExternallyImported: false,
        resolvedModuleType: 'firstPartyCode',
        resolvedModulePath: BARREL_CHAIN_IMPL,
        importedBy: [],
        barrelImportedBy: [
          { filePath: BARREL_ENTRY_CHAIN, importEntry: ORIGIN_ENTRY_CHAIN },
        ],
        externallyImportedBy: [],
        rootModuleType: undefined,
      },
    ],
    barrelReexports: [],
  },
  [BARREL_CHAIN_IMPL]: {
    fileType: 'code',
    entryPointSpecifier: undefined,
    isExternallyImported: false,
    ...NO_IMPORTS,
    exports: [
      {
        type: 'export',
        exportName: 'chainFn',
        isEntryPoint: false,
        isExternallyImported: false,
        isTypeExport: false,
        importedBy: [],
        barrelImportedBy: [
          { filePath: BARREL_ENTRY_CHAIN, importEntry: ORIGIN_ENTRY_CHAIN },
        ],
        externallyImportedBy: [],
      },
      {
        type: 'export',
        exportName: 'chainOther',
        isEntryPoint: false,
        isExternallyImported: false,
        isTypeExport: false,
        ...EMPTY_LISTS,
      },
    ],
    singleReexports: [],
    barrelReexports: [],
  },

  // `import def from './entry-star'`: `export *` does not forward default,
  // so the import is unresolved and star-impl's default stays unimported.
  [BARREL_DEF_CONSUMER]: {
    fileType: 'code',
    entryPointSpecifier: undefined,
    isExternallyImported: false,
    singleImports: [
      {
        type: 'singleImport',
        moduleSpecifier: './entry-star',
        importName: 'default',
        importAlias: 'def',
        isTypeImport: false,
        resolvedModuleType: 'firstPartyCode',
        resolvedModulePath: BARREL_ENTRY_STAR,
        rootModuleType: undefined,
      },
    ],
    barrelImports: [],
    dynamicImports: [],
    sideEffectImports: [],
    exports: [],
    singleReexports: [],
    barrelReexports: [],
  },

  // dup-impl is reached both by name (through `export { dupFn }`) and
  // through `export *` from the same origin; each entry records the origin
  // exactly once.
  [BARREL_DUP_CONSUMER]: {
    fileType: 'code',
    entryPointSpecifier: undefined,
    isExternallyImported: false,
    singleImports: [],
    barrelImports: [ORIGIN_DUP_CONSUMER],
    dynamicImports: [],
    sideEffectImports: [],
    exports: [],
    singleReexports: [],
    barrelReexports: [],
  },
  [BARREL_DUP_BARREL]: {
    fileType: 'code',
    entryPointSpecifier: undefined,
    isExternallyImported: false,
    ...NO_IMPORTS,
    exports: [],
    singleReexports: [
      {
        type: 'singleReexport',
        moduleSpecifier: './dup-impl',
        importName: 'dupFn',
        exportName: 'dupFn',
        isTypeReexport: false,
        isEntryPoint: false,
        isExternallyImported: false,
        resolvedModuleType: 'firstPartyCode',
        resolvedModulePath: BARREL_DUP_IMPL,
        importedBy: [],
        barrelImportedBy: [
          { filePath: BARREL_DUP_CONSUMER, importEntry: ORIGIN_DUP_CONSUMER },
        ],
        externallyImportedBy: [],
        rootModuleType: undefined,
      },
    ],
    barrelReexports: [
      {
        type: 'barrelReexport',
        isTypeReexport: false,
        moduleSpecifier: './dup-impl',
        exportName: undefined,
        isEntryPoint: false,
        isExternallyImported: false,
        resolvedModuleType: 'firstPartyCode',
        resolvedModulePath: BARREL_DUP_IMPL,
        importedBy: [],
        barrelImportedBy: [
          { filePath: BARREL_DUP_CONSUMER, importEntry: ORIGIN_DUP_CONSUMER },
        ],
        externallyImportedBy: [],
      },
    ],
  },
  [BARREL_DUP_IMPL]: {
    fileType: 'code',
    entryPointSpecifier: undefined,
    isExternallyImported: false,
    ...NO_IMPORTS,
    exports: [
      {
        type: 'export',
        exportName: 'dupFn',
        isEntryPoint: false,
        isExternallyImported: false,
        isTypeExport: false,
        importedBy: [],
        barrelImportedBy: [
          { filePath: BARREL_DUP_CONSUMER, importEntry: ORIGIN_DUP_CONSUMER },
        ],
        externallyImportedBy: [],
      },
      {
        type: 'export',
        exportName: 'dupOther',
        isEntryPoint: false,
        isExternallyImported: false,
        isTypeExport: false,
        importedBy: [],
        barrelImportedBy: [
          { filePath: BARREL_DUP_CONSUMER, importEntry: ORIGIN_DUP_CONSUMER },
        ],
        externallyImportedBy: [],
      },
    ],
    singleReexports: [],
    barrelReexports: [],
  },

  // One origin reaches revisit-impl twice: first through `export *`, which
  // leaves out `default`, then through `export * as nested`, which includes
  // it. The second visit must add exactly the default export.
  [BARREL_REVISIT_CONSUMER]: {
    fileType: 'code',
    entryPointSpecifier: undefined,
    isExternallyImported: false,
    singleImports: [],
    barrelImports: [ORIGIN_REVISIT_CONSUMER],
    dynamicImports: [],
    sideEffectImports: [],
    exports: [],
    singleReexports: [],
    barrelReexports: [],
  },
  [BARREL_REVISIT_BARREL]: {
    fileType: 'code',
    entryPointSpecifier: undefined,
    isExternallyImported: false,
    ...NO_IMPORTS,
    exports: [],
    singleReexports: [],
    barrelReexports: [
      {
        type: 'barrelReexport',
        isTypeReexport: false,
        moduleSpecifier: './revisit-impl',
        exportName: undefined,
        isEntryPoint: false,
        isExternallyImported: false,
        resolvedModuleType: 'firstPartyCode',
        resolvedModulePath: BARREL_REVISIT_IMPL,
        importedBy: [],
        barrelImportedBy: [
          {
            filePath: BARREL_REVISIT_CONSUMER,
            importEntry: ORIGIN_REVISIT_CONSUMER,
          },
        ],
        externallyImportedBy: [],
      },
      {
        type: 'barrelReexport',
        isTypeReexport: false,
        moduleSpecifier: './revisit-impl',
        exportName: 'nested',
        isEntryPoint: false,
        isExternallyImported: false,
        resolvedModuleType: 'firstPartyCode',
        resolvedModulePath: BARREL_REVISIT_IMPL,
        importedBy: [],
        barrelImportedBy: [
          {
            filePath: BARREL_REVISIT_CONSUMER,
            importEntry: ORIGIN_REVISIT_CONSUMER,
          },
        ],
        externallyImportedBy: [],
      },
    ],
  },
  [BARREL_REVISIT_IMPL]: {
    fileType: 'code',
    entryPointSpecifier: undefined,
    isExternallyImported: false,
    ...NO_IMPORTS,
    exports: [
      {
        type: 'export',
        exportName: 'revisitFn',
        isEntryPoint: false,
        isExternallyImported: false,
        isTypeExport: false,
        importedBy: [],
        barrelImportedBy: [
          {
            filePath: BARREL_REVISIT_CONSUMER,
            importEntry: ORIGIN_REVISIT_CONSUMER,
          },
        ],
        externallyImportedBy: [],
      },
      {
        type: 'export',
        exportName: 'default',
        isEntryPoint: false,
        isExternallyImported: false,
        isTypeExport: false,
        importedBy: [],
        barrelImportedBy: [
          {
            filePath: BARREL_REVISIT_CONSUMER,
            importEntry: ORIGIN_REVISIT_CONSUMER,
          },
        ],
        externallyImportedBy: [],
      },
    ],
    singleReexports: [],
    barrelReexports: [],
  },

  // `import { siblingFn } from './sibling-barrel'`: the barrel's first
  // `export *` probes sibling-impl for `siblingFn` and fails; its second
  // reaches sibling-rename, whose `export { siblingImpl as siblingFn }` asks
  // sibling-impl again under the other name. That second visit must not be
  // refused because of the first, so the import resolves to sibling-impl and
  // only the `export *` that supplied the name is recorded as reached.
  [BARREL_SIBLING_CONSUMER]: {
    fileType: 'code',
    entryPointSpecifier: undefined,
    isExternallyImported: false,
    singleImports: [
      {
        ...ORIGIN_SIBLING_CONSUMER,
        rootExportEntry: {
          type: 'export',
          exportName: 'siblingImpl',
          isEntryPoint: false,
          isExternallyImported: false,
          isTypeExport: false,
        },
      },
    ],
    barrelImports: [],
    dynamicImports: [],
    sideEffectImports: [],
    exports: [],
    singleReexports: [],
    barrelReexports: [],
  },
  [BARREL_SIBLING_BARREL]: {
    fileType: 'code',
    entryPointSpecifier: undefined,
    isExternallyImported: false,
    ...NO_IMPORTS,
    exports: [],
    singleReexports: [],
    barrelReexports: [
      {
        type: 'barrelReexport',
        isTypeReexport: false,
        moduleSpecifier: './sibling-impl',
        exportName: undefined,
        isEntryPoint: false,
        isExternallyImported: false,
        resolvedModuleType: 'firstPartyCode',
        resolvedModulePath: BARREL_SIBLING_IMPL,
        ...EMPTY_LISTS,
      },
      {
        type: 'barrelReexport',
        isTypeReexport: false,
        moduleSpecifier: './sibling-rename',
        exportName: undefined,
        isEntryPoint: false,
        isExternallyImported: false,
        resolvedModuleType: 'firstPartyCode',
        resolvedModulePath: BARREL_SIBLING_RENAME,
        importedBy: [
          {
            filePath: BARREL_SIBLING_CONSUMER,
            importEntry: ORIGIN_SIBLING_CONSUMER,
          },
        ],
        barrelImportedBy: [],
        externallyImportedBy: [],
      },
    ],
  },
  [BARREL_SIBLING_RENAME]: {
    fileType: 'code',
    entryPointSpecifier: undefined,
    isExternallyImported: false,
    ...NO_IMPORTS,
    exports: [],
    singleReexports: [
      {
        type: 'singleReexport',
        moduleSpecifier: './sibling-impl',
        importName: 'siblingImpl',
        exportName: 'siblingFn',
        isTypeReexport: false,
        isEntryPoint: false,
        isExternallyImported: false,
        resolvedModuleType: 'firstPartyCode',
        resolvedModulePath: BARREL_SIBLING_IMPL,
        importedBy: [
          {
            filePath: BARREL_SIBLING_CONSUMER,
            importEntry: ORIGIN_SIBLING_CONSUMER,
          },
        ],
        barrelImportedBy: [],
        externallyImportedBy: [],
        rootModuleType: undefined,
      },
    ],
    barrelReexports: [],
  },
  [BARREL_SIBLING_IMPL]: {
    fileType: 'code',
    entryPointSpecifier: undefined,
    isExternallyImported: false,
    ...NO_IMPORTS,
    exports: [
      {
        type: 'export',
        exportName: 'siblingImpl',
        isEntryPoint: false,
        isExternallyImported: false,
        isTypeExport: false,
        importedBy: [
          {
            filePath: BARREL_SIBLING_CONSUMER,
            importEntry: ORIGIN_SIBLING_CONSUMER,
          },
        ],
        barrelImportedBy: [],
        externallyImportedBy: [],
      },
    ],
    singleReexports: [],
    barrelReexports: [],
  },

  // `import * as n from './nodefault-barrel'`, where the barrel is two bare
  // `export *` statements. One lands on a file whose `default` is a single
  // re-export, the other on a file whose `default` is an `export * as`. A bare
  // `export *` never forwards `default`, so neither default-named re-export is
  // a member of the namespace, and nodefault-impl behind them is not reached
  // at all. Everything else in those files is.
  [BARREL_NODEFAULT_CONSUMER]: {
    fileType: 'code',
    entryPointSpecifier: undefined,
    isExternallyImported: false,
    singleImports: [],
    barrelImports: [ORIGIN_NODEFAULT_CONSUMER],
    dynamicImports: [],
    sideEffectImports: [],
    exports: [],
    singleReexports: [],
    barrelReexports: [],
  },
  [BARREL_NODEFAULT_BARREL]: {
    fileType: 'code',
    entryPointSpecifier: undefined,
    isExternallyImported: false,
    ...NO_IMPORTS,
    exports: [],
    singleReexports: [],
    barrelReexports: [
      {
        type: 'barrelReexport',
        isTypeReexport: false,
        moduleSpecifier: './nodefault-single',
        exportName: undefined,
        isEntryPoint: false,
        isExternallyImported: false,
        resolvedModuleType: 'firstPartyCode',
        resolvedModulePath: BARREL_NODEFAULT_SINGLE,
        importedBy: [],
        barrelImportedBy: [
          {
            filePath: BARREL_NODEFAULT_CONSUMER,
            importEntry: ORIGIN_NODEFAULT_CONSUMER,
          },
        ],
        externallyImportedBy: [],
      },
      {
        type: 'barrelReexport',
        isTypeReexport: false,
        moduleSpecifier: './nodefault-ns',
        exportName: undefined,
        isEntryPoint: false,
        isExternallyImported: false,
        resolvedModuleType: 'firstPartyCode',
        resolvedModulePath: BARREL_NODEFAULT_NS,
        importedBy: [],
        barrelImportedBy: [
          {
            filePath: BARREL_NODEFAULT_CONSUMER,
            importEntry: ORIGIN_NODEFAULT_CONSUMER,
          },
        ],
        externallyImportedBy: [],
      },
    ],
  },
  [BARREL_NODEFAULT_SINGLE]: {
    fileType: 'code',
    entryPointSpecifier: undefined,
    isExternallyImported: false,
    ...NO_IMPORTS,
    exports: [
      {
        type: 'export',
        exportName: 'nodefaultSingleOwn',
        isEntryPoint: false,
        isExternallyImported: false,
        isTypeExport: false,
        importedBy: [],
        barrelImportedBy: [
          {
            filePath: BARREL_NODEFAULT_CONSUMER,
            importEntry: ORIGIN_NODEFAULT_CONSUMER,
          },
        ],
        externallyImportedBy: [],
      },
    ],
    singleReexports: [
      {
        type: 'singleReexport',
        moduleSpecifier: './nodefault-impl',
        importName: 'nodefaultImpl',
        exportName: 'default',
        isTypeReexport: false,
        isEntryPoint: false,
        isExternallyImported: false,
        resolvedModuleType: 'firstPartyCode',
        resolvedModulePath: BARREL_NODEFAULT_IMPL,
        ...EMPTY_LISTS,
        rootModuleType: undefined,
      },
    ],
    barrelReexports: [],
  },
  [BARREL_NODEFAULT_NS]: {
    fileType: 'code',
    entryPointSpecifier: undefined,
    isExternallyImported: false,
    ...NO_IMPORTS,
    exports: [
      {
        type: 'export',
        exportName: 'nodefaultNsOwn',
        isEntryPoint: false,
        isExternallyImported: false,
        isTypeExport: false,
        importedBy: [],
        barrelImportedBy: [
          {
            filePath: BARREL_NODEFAULT_CONSUMER,
            importEntry: ORIGIN_NODEFAULT_CONSUMER,
          },
        ],
        externallyImportedBy: [],
      },
    ],
    singleReexports: [],
    barrelReexports: [
      {
        type: 'barrelReexport',
        isTypeReexport: false,
        moduleSpecifier: './nodefault-impl',
        exportName: 'default',
        isEntryPoint: false,
        isExternallyImported: false,
        resolvedModuleType: 'firstPartyCode',
        resolvedModulePath: BARREL_NODEFAULT_IMPL,
        ...EMPTY_LISTS,
      },
    ],
  },
  [BARREL_NODEFAULT_IMPL]: {
    fileType: 'code',
    entryPointSpecifier: undefined,
    isExternallyImported: false,
    ...NO_IMPORTS,
    exports: [
      {
        type: 'export',
        exportName: 'nodefaultImpl',
        isEntryPoint: false,
        isExternallyImported: false,
        isTypeExport: false,
        ...EMPTY_LISTS,
      },
    ],
    singleReexports: [],
    barrelReexports: [],
  },

  // unseen-barrel is two `export *` statements into a dot-folder, which is
  // ignored, so the plugin can't see what they export. `unseenFn` may come
  // from either, so the import counts as resolved and both are reached.
  // unseen-precedence is `export *` of unseen-barrel and then of unseen-impl,
  // which has `visibleFn`. A name that visible code supplies resolves to that
  // code, even when an `export *` the plugin can't see is searched first.
  [BARREL_UNSEEN_CONSUMER]: {
    fileType: 'code',
    entryPointSpecifier: undefined,
    isExternallyImported: false,
    singleImports: [
      ORIGIN_UNSEEN_CONSUMER,
      {
        ...ORIGIN_UNSEEN_PRECEDENCE_CONSUMER,
        rootExportEntry: {
          type: 'export',
          exportName: 'visibleFn',
          isEntryPoint: false,
          isExternallyImported: false,
          isTypeExport: false,
        },
      },
    ],
    barrelImports: [],
    dynamicImports: [],
    sideEffectImports: [],
    exports: [],
    singleReexports: [],
    barrelReexports: [],
  },
  [BARREL_UNSEEN_BARREL]: {
    fileType: 'code',
    entryPointSpecifier: undefined,
    isExternallyImported: false,
    ...NO_IMPORTS,
    exports: [],
    singleReexports: [],
    barrelReexports: [
      {
        type: 'barrelReexport',
        isTypeReexport: false,
        moduleSpecifier: './.unseen/first',
        exportName: undefined,
        isEntryPoint: false,
        isExternallyImported: false,
        resolvedModuleType: 'firstPartyOther',
        resolvedModulePath: undefined,
        importedBy: [
          {
            filePath: BARREL_UNSEEN_CONSUMER,
            importEntry: ORIGIN_UNSEEN_CONSUMER,
          },
        ],
        barrelImportedBy: [],
        externallyImportedBy: [],
      },
      {
        type: 'barrelReexport',
        isTypeReexport: false,
        moduleSpecifier: './.unseen/second',
        exportName: undefined,
        isEntryPoint: false,
        isExternallyImported: false,
        resolvedModuleType: 'firstPartyOther',
        resolvedModulePath: undefined,
        importedBy: [
          {
            filePath: BARREL_UNSEEN_CONSUMER,
            importEntry: ORIGIN_UNSEEN_CONSUMER,
          },
        ],
        barrelImportedBy: [],
        externallyImportedBy: [],
      },
    ],
  },
  [BARREL_UNSEEN_PRECEDENCE]: {
    fileType: 'code',
    entryPointSpecifier: undefined,
    isExternallyImported: false,
    ...NO_IMPORTS,
    exports: [],
    singleReexports: [],
    barrelReexports: [
      {
        type: 'barrelReexport',
        isTypeReexport: false,
        moduleSpecifier: './unseen-barrel',
        exportName: undefined,
        isEntryPoint: false,
        isExternallyImported: false,
        resolvedModuleType: 'firstPartyCode',
        resolvedModulePath: BARREL_UNSEEN_BARREL,
        ...EMPTY_LISTS,
      },
      {
        type: 'barrelReexport',
        isTypeReexport: false,
        moduleSpecifier: './unseen-impl',
        exportName: undefined,
        isEntryPoint: false,
        isExternallyImported: false,
        resolvedModuleType: 'firstPartyCode',
        resolvedModulePath: BARREL_UNSEEN_IMPL,
        importedBy: [
          {
            filePath: BARREL_UNSEEN_CONSUMER,
            importEntry: ORIGIN_UNSEEN_PRECEDENCE_CONSUMER,
          },
        ],
        barrelImportedBy: [],
        externallyImportedBy: [],
      },
    ],
  },
  [BARREL_UNSEEN_IMPL]: {
    fileType: 'code',
    entryPointSpecifier: undefined,
    isExternallyImported: false,
    ...NO_IMPORTS,
    exports: [
      {
        type: 'export',
        exportName: 'visibleFn',
        isEntryPoint: false,
        isExternallyImported: false,
        isTypeExport: false,
        importedBy: [
          {
            filePath: BARREL_UNSEEN_CONSUMER,
            importEntry: ORIGIN_UNSEEN_PRECEDENCE_CONSUMER,
          },
        ],
        barrelImportedBy: [],
        externallyImportedBy: [],
      },
    ],
    singleReexports: [],
    barrelReexports: [],
  },

  // The one cycle in this fixture. cycle-barrel is `export * from
  // './cycle-rename'`, and cycle-rename is `export { cycleFn as cycleAlias }
  // from './cycle-barrel'` beside `export const cycleFn`. Resolving
  // `cycleAlias` passes through cycle-barrel's `export *` twice, once per
  // name, and the import is still recorded on it once.
  [BARREL_CYCLE_CONSUMER]: {
    fileType: 'code',
    entryPointSpecifier: undefined,
    isExternallyImported: false,
    singleImports: [
      {
        ...ORIGIN_CYCLE_CONSUMER,
        rootExportEntry: {
          type: 'export',
          exportName: 'cycleFn',
          isEntryPoint: false,
          isExternallyImported: false,
          isTypeExport: false,
        },
      },
    ],
    barrelImports: [],
    dynamicImports: [],
    sideEffectImports: [],
    exports: [],
    singleReexports: [],
    barrelReexports: [],
  },
  [BARREL_CYCLE_BARREL]: {
    fileType: 'code',
    entryPointSpecifier: undefined,
    isExternallyImported: false,
    ...NO_IMPORTS,
    exports: [],
    singleReexports: [],
    barrelReexports: [
      {
        type: 'barrelReexport',
        isTypeReexport: false,
        moduleSpecifier: './cycle-rename',
        exportName: undefined,
        isEntryPoint: false,
        isExternallyImported: false,
        resolvedModuleType: 'firstPartyCode',
        resolvedModulePath: BARREL_CYCLE_RENAME,
        importedBy: [
          {
            filePath: BARREL_CYCLE_CONSUMER,
            importEntry: ORIGIN_CYCLE_CONSUMER,
          },
        ],
        barrelImportedBy: [],
        externallyImportedBy: [],
      },
    ],
  },
  [BARREL_CYCLE_RENAME]: {
    fileType: 'code',
    entryPointSpecifier: undefined,
    isExternallyImported: false,
    ...NO_IMPORTS,
    exports: [
      {
        type: 'export',
        exportName: 'cycleFn',
        isEntryPoint: false,
        isExternallyImported: false,
        isTypeExport: false,
        importedBy: [
          {
            filePath: BARREL_CYCLE_CONSUMER,
            importEntry: ORIGIN_CYCLE_CONSUMER,
          },
        ],
        barrelImportedBy: [],
        externallyImportedBy: [],
      },
    ],
    singleReexports: [
      {
        type: 'singleReexport',
        moduleSpecifier: './cycle-barrel',
        importName: 'cycleFn',
        exportName: 'cycleAlias',
        isTypeReexport: false,
        isEntryPoint: false,
        isExternallyImported: false,
        resolvedModuleType: 'firstPartyCode',
        resolvedModulePath: BARREL_CYCLE_BARREL,
        importedBy: [
          {
            filePath: BARREL_CYCLE_CONSUMER,
            importEntry: ORIGIN_CYCLE_CONSUMER,
          },
        ],
        barrelImportedBy: [],
        externallyImportedBy: [],
        rootModuleType: undefined,
      },
    ],
    barrelReexports: [],
  },
};

it('Records barrel reachability precisely, including re-export statements along the way', () => {
  const info = computeAnalyzedInfo(
    computeResolvedInfo(
      computeBaseInfo({
        packageRootDir: BARREL_DIR,
        packageName: 'test',
        wildcardAliases: {},
        fixedAliases: {},
        ignorePatterns: [],
        ignoreOverridePatterns: [],
        defaultIgnoreOverrides: [],
        getEntryPointSpecifier: (filePath) => BARREL_ENTRY_POINTS.get(filePath),
        isExternallyImportedCheck: () => false,
      })
    )
  );
  expect(info).toMatchAnalyzedSpec(EXPECTED_BARREL_REACHABILITY);
});
