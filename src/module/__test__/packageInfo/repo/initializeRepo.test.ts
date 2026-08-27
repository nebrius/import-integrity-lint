import { join } from 'node:path';

import type { ParsedPackageSettings } from '../../../../settings/settings.js';
import type { AnalyzedCodeFileDetails } from '../../../../types/analyzed.js';
import {
  getPackageInfo,
  initializePackage,
  initializeRepo,
} from '../../../module.js';

function assertDefined<T>(
  value: T,
  message: string
): asserts value is NonNullable<T> {
  if (value === undefined || value === null) {
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

function findExport(fileDetails: AnalyzedCodeFileDetails, exportName: string) {
  return [
    ...fileDetails.exports,
    ...fileDetails.singleReexports,
    ...fileDetails.barrelReexports,
  ].find((entry) => entry.exportName === exportName);
}

// project/monorepo/yarn.lock is load-bearing: @manypkg uses it to detect this
// fixture as a Yarn-workspaces monorepo.
const MONOREPO_DIR = join(import.meta.dirname, 'project', 'monorepo');
const PACKAGES_DIR = join(MONOREPO_DIR, 'packages');
const PACKAGE_A_DIR = join(PACKAGES_DIR, 'packageA');
const PACKAGE_B_DIR = join(PACKAGES_DIR, 'packageB');
const PACKAGE_C_DIR = join(PACKAGES_DIR, 'packageC');
const PACKAGE_D_DIR = join(PACKAGES_DIR, 'packageD');
const PACKAGE_E_DIR = join(PACKAGES_DIR, 'packageE');
const PACKAGE_F_DIR = join(PACKAGES_DIR, 'packageF');
const PACKAGE_G_DIR = join(PACKAGES_DIR, 'packageG');
const PACKAGE_H_DIR = join(PACKAGES_DIR, 'packageH');

const FILE_A = join(PACKAGE_A_DIR, 'a.ts');
const FILE_B = join(PACKAGE_B_DIR, 'b.ts');
const FILE_C = join(PACKAGE_C_DIR, 'c.ts');
const FILE_D = join(PACKAGE_D_DIR, 'd.ts');
const FILE_E = join(PACKAGE_E_DIR, 'e.ts');
const FILE_F_A = join(PACKAGE_F_DIR, 'a.ts');
const FILE_F_B = join(PACKAGE_F_DIR, 'b.ts');
const FILE_G_FOO = join(PACKAGE_G_DIR, 'lib', 'foo.ts');
const FILE_G_BAR = join(PACKAGE_G_DIR, 'lib', 'bar.ts');
const FILE_H = join(PACKAGE_H_DIR, 'h.ts');

function initialize() {
  initializeRepo({
    filename: FILE_A,
    settings: {
      'import-integrity': { monorepoRootDir: MONOREPO_DIR },
    },
  });
}

it('Cross-package import cycle populates externallyImportedBy on both sides', () => {
  initialize();

  // packageA's A is imported by both packageB (single) and packageE (barrel);
  // check the single importer from packageB here. The barrel importer from
  // packageE is checked in the dedicated barrel-import test.
  const pkgAInfo = getPackageInfo(PACKAGE_A_DIR);
  const fileA = pkgAInfo.packageEntryPointExports.get('@test/package-a');
  assertDefined(fileA, '@test/package-a entry point missing on packageA');
  const aExport = findExport(fileA, 'A');
  assertDefined(aExport, 'A export missing on @test/package-a');
  expect(aExport).toMatchObject({
    type: 'export',
    exportName: 'A',
    isTypeExport: true,
    isEntryPoint: true,
    isExternallyImported: false,
  });
  const aSingleImporters = aExport.externallyImportedBy.filter(
    (entry) => entry.importEntry.type === 'singleImport'
  );
  expect(aSingleImporters).toHaveLength(1);
  expect(aSingleImporters[0]).toMatchObject({
    packageRootDir: PACKAGE_B_DIR,
    filePath: FILE_B,
    importEntry: {
      type: 'singleImport',
      importName: 'A',
      moduleSpecifier: '@test/package-a',
    },
  });
  expectNoDuplicateExternalImporters(aExport.externallyImportedBy);

  const pkgBInfo = getPackageInfo(PACKAGE_B_DIR);
  const fileB = pkgBInfo.packageEntryPointExports.get('@test/package-b/b');
  assertDefined(fileB, '@test/package-b/b entry point missing on packageB');
  const bExport = findExport(fileB, 'B');
  assertDefined(bExport, 'B export missing on @test/package-b/b');
  expect(bExport).toMatchObject({
    type: 'export',
    exportName: 'B',
    isTypeExport: true,
    isEntryPoint: true,
    isExternallyImported: false,
  });
  expect(bExport.externallyImportedBy).toHaveLength(1);
  expect(bExport.externallyImportedBy[0]).toMatchObject({
    packageRootDir: PACKAGE_A_DIR,
    filePath: FILE_A,
    importEntry: {
      type: 'singleImport',
      importName: 'B',
      moduleSpecifier: '@test/package-b/b',
    },
  });
  expectNoDuplicateExternalImporters(bExport.externallyImportedBy);
});

it('Cross-package barrelImport populates externallyImportedBy on every entry-point export', () => {
  initialize();

  const pkgAInfo = getPackageInfo(PACKAGE_A_DIR);
  const fileA = pkgAInfo.packageEntryPointExports.get('@test/package-a');
  assertDefined(fileA, '@test/package-a entry point missing on packageA');
  const aExport = findExport(fileA, 'A');
  assertDefined(aExport, 'A export missing on @test/package-a');

  const barrelImporters = aExport.externallyImportedBy.filter(
    (entry) => entry.importEntry.type === 'barrelImport'
  );
  expect(barrelImporters).toHaveLength(1);
  expect(barrelImporters[0]).toMatchObject({
    packageRootDir: PACKAGE_E_DIR,
    filePath: FILE_E,
    importEntry: {
      type: 'barrelImport',
      moduleSpecifier: '@test/package-a',
    },
  });
  expectNoDuplicateExternalImporters(aExport.externallyImportedBy);
});

it('Named barrel reexport entry point tracks cross-package importer', () => {
  initialize();

  const pkgDInfo = getPackageInfo(PACKAGE_D_DIR);
  const fileD = pkgDInfo.packageEntryPointExports.get('@test/package-d/d');
  assertDefined(fileD, '@test/package-d/d entry point missing on packageD');
  const utilsExport = findExport(fileD, 'utils');
  assertDefined(utilsExport, 'utils export missing on @test/package-d/d');
  expect(utilsExport).toMatchObject({
    type: 'barrelReexport',
    exportName: 'utils',
    isEntryPoint: true,
    isExternallyImported: false,
  });
  expect(utilsExport.externallyImportedBy).toHaveLength(1);
  expect(utilsExport.externallyImportedBy[0]).toMatchObject({
    packageRootDir: PACKAGE_C_DIR,
    filePath: FILE_C,
    importEntry: {
      type: 'singleImport',
      importName: 'utils',
      moduleSpecifier: '@test/package-d/d',
    },
  });
  expectNoDuplicateExternalImporters(utilsExport.externallyImportedBy);
});

it('Entry-point export that is not imported by any other package has empty externallyImportedBy', () => {
  initialize();

  const pkgCInfo = getPackageInfo(PACKAGE_C_DIR);
  const fileC = pkgCInfo.packageEntryPointExports.get('@test/package-c');
  assertDefined(fileC, '@test/package-c entry point missing on packageC');
  const cExport = findExport(fileC, 'C');
  assertDefined(cExport, 'C export missing on @test/package-c');
  expect(cExport).toMatchObject({
    type: 'export',
    exportName: 'C',
    isTypeExport: false,
    isEntryPoint: true,
    isExternallyImported: false,
  });
  expect(cExport.externallyImportedBy).toEqual([]);
  expectNoDuplicateExternalImporters(cExport.externallyImportedBy);
});

it('Entry-point files for all four packages appear in packageEntryPointExports keyed by specifier', () => {
  initialize();

  // For each package, pin three invariants at once:
  //   1. The map is keyed by the expected specifier.
  //   2. The file registered under that specifier is the exact same object in
  //      `files`, and its own `entryPointSpecifier` round-trips back to the
  //      map key.
  //   3. Every named export/reexport on that file is marked
  //      `isEntryPoint: true`, which is the per-export fidelity the pre-
  //      refactor `Map<exportName, exportEntry>` test used to provide.
  const cases: Array<{
    dir: string;
    filePath: string;
    specifier: string;
    expectedExportNames: string[];
  }> = [
    {
      dir: PACKAGE_A_DIR,
      filePath: FILE_A,
      specifier: '@test/package-a',
      expectedExportNames: ['A'],
    },
    {
      dir: PACKAGE_B_DIR,
      filePath: FILE_B,
      specifier: '@test/package-b/b',
      expectedExportNames: ['B'],
    },
    {
      dir: PACKAGE_C_DIR,
      filePath: FILE_C,
      specifier: '@test/package-c',
      expectedExportNames: ['C'],
    },
    {
      dir: PACKAGE_D_DIR,
      filePath: FILE_D,
      specifier: '@test/package-d/d',
      // `d.ts` has exactly one named barrel reexport: `export * as utils from
      // './internal.js'`. That entry must be marked as an entry-point export.
      expectedExportNames: ['utils'],
    },
  ];

  for (const { dir, filePath, specifier, expectedExportNames } of cases) {
    const info = getPackageInfo(dir);
    expect([...info.packageEntryPointExports.keys()]).toEqual([specifier]);
    const registeredFile = info.packageEntryPointExports.get(specifier);
    expect(registeredFile).toBe(info.files.get(filePath));
    expect(registeredFile?.entryPointSpecifier).toBe(specifier);

    assertDefined(registeredFile, `${specifier} entry point missing`);
    const allExportEntries = [
      ...registeredFile.exports,
      ...registeredFile.singleReexports,
      ...registeredFile.barrelReexports,
    ];
    for (const entry of allExportEntries) {
      expect(entry.isEntryPoint).toBe(true);
    }
    expect(
      allExportEntries
        .map((entry) => entry.exportName)
        .filter((name): name is string => name !== undefined)
        .sort()
    ).toEqual([...expectedExportNames].sort());
  }
});

it('Files inside packageD beyond the entry point are reachable via getPackageInfo', () => {
  initialize();

  const pkgDInfo = getPackageInfo(PACKAGE_D_DIR);
  // d.ts, internal.ts, internal2.ts, package.json, import-integrity.config.json = 5
  expect(pkgDInfo.files.size).toBe(5);
  expect(pkgDInfo.files.has(FILE_D)).toBe(true);
  expect(pkgDInfo.files.has(join(PACKAGE_D_DIR, 'internal.ts'))).toBe(true);
  expect(pkgDInfo.files.has(join(PACKAGE_D_DIR, 'internal2.ts'))).toBe(true);
});

// ─── Multi-subpath entry-point packages (packageF) ──────────────────────────
//
// packageF declares two static subpath entry points: `./a` → a.ts, `./b` →
// b.ts. packageH consumes only `@test/package-f/a`. The assertions pin the
// core behavior of the subpath-aware refactor: cross-package wiring lights
// up only the imported subpath, the non-imported subpath stays cold, and a
// bare `@test/package-f` specifier (no `.` entry registered) must resolve to
// nothing via `packageImportMap`.

it('Multi-subpath package: each subpath registers as its own packageEntryPointExports key', () => {
  initialize();

  const pkgFInfo = getPackageInfo(PACKAGE_F_DIR);
  expect([...pkgFInfo.packageEntryPointExports.keys()].sort()).toEqual([
    '@test/package-f/a',
    '@test/package-f/b',
  ]);

  const entryA = pkgFInfo.packageEntryPointExports.get('@test/package-f/a');
  const entryB = pkgFInfo.packageEntryPointExports.get('@test/package-f/b');
  expect(entryA).toBe(pkgFInfo.files.get(FILE_F_A));
  expect(entryB).toBe(pkgFInfo.files.get(FILE_F_B));
  expect(entryA?.entryPointSpecifier).toBe('@test/package-f/a');
  expect(entryB?.entryPointSpecifier).toBe('@test/package-f/b');
});

it('Multi-subpath package: cross-package singleImport lights up only the imported subpath', () => {
  initialize();

  const pkgFInfo = getPackageInfo(PACKAGE_F_DIR);
  const fileFA = pkgFInfo.packageEntryPointExports.get('@test/package-f/a');
  assertDefined(fileFA, '@test/package-f/a entry point missing on packageF');
  const faExport = findExport(fileFA, 'Fa');
  assertDefined(faExport, 'Fa export missing on @test/package-f/a');

  // packageH/h.ts imports `Fa` from `@test/package-f/a`; no other consumers
  // exist, so exactly one external single importer on this specific export.
  expect(faExport.externallyImportedBy).toHaveLength(1);
  expect(faExport.externallyImportedBy[0]).toMatchObject({
    packageRootDir: PACKAGE_H_DIR,
    filePath: FILE_H,
    importEntry: {
      type: 'singleImport',
      importName: 'Fa',
      moduleSpecifier: '@test/package-f/a',
    },
  });
  expectNoDuplicateExternalImporters(faExport.externallyImportedBy);

  // Sibling subpath stays cold: packageH imports neither `@test/package-f/b`
  // nor anything that would resolve to b.ts. If the lookup were still keyed
  // by package name (pre-refactor behavior), a bare or sibling-subpath import
  // would leak onto Fb here.
  const fileFB = pkgFInfo.packageEntryPointExports.get('@test/package-f/b');
  assertDefined(fileFB, '@test/package-f/b entry point missing on packageF');
  const fbExport = findExport(fileFB, 'Fb');
  assertDefined(fbExport, 'Fb export missing on @test/package-f/b');
  expect(fbExport.externallyImportedBy).toEqual([]);
});

it('Bare package-name specifier does not match any registered subpath entry point', () => {
  initialize();

  // packageH's `import * as bareF from '@test/package-f'` uses a bare package
  // specifier that is not registered as an entry point (packageF only
  // registers `./a` and `./b`). `packageImportMap.get('@test/package-f')`
  // therefore returns undefined and the barrel-import branch in
  // computeRepoInfo is skipped. If the lookup were still keyed by package
  // name, every entry-point export on Fa and Fb would pick up a barrelImport
  // entry here.
  const pkgFInfo = getPackageInfo(PACKAGE_F_DIR);

  for (const specifier of ['@test/package-f/a', '@test/package-f/b']) {
    const entryFile = pkgFInfo.packageEntryPointExports.get(specifier);
    assertDefined(entryFile, `${specifier} entry point missing on packageF`);
    for (const exportEntry of entryFile.exports) {
      const barrelImporters = exportEntry.externallyImportedBy.filter(
        (e) => e.importEntry.type === 'barrelImport'
      );
      expect(barrelImporters).toEqual([]);
    }
  }
});

// ─── Dynamic (wildcard) entry-point package (packageG) ──────────────────────
//
// packageG declares a single dynamic entry `./lib/*` → `./lib/*.ts`. Per the
// Node.js subpath-exports model, the captured wildcard is substituted back
// into the subpath pattern, so the specifier preserves the `./lib/` prefix:
// `lib/foo.ts` → `@test/package-g/lib/foo` (not `@test/package-g/foo`).
// The wildcard expands to two distinct entry-point specifiers; packageH
// consumes `@test/package-g/lib/foo` only.

it('Dynamic entry point: wildcard expands to one specifier per matching file', () => {
  initialize();

  const pkgGInfo = getPackageInfo(PACKAGE_G_DIR);
  expect([...pkgGInfo.packageEntryPointExports.keys()].sort()).toEqual([
    '@test/package-g/lib/bar',
    '@test/package-g/lib/foo',
  ]);

  const fooEntry = pkgGInfo.packageEntryPointExports.get(
    '@test/package-g/lib/foo'
  );
  const barEntry = pkgGInfo.packageEntryPointExports.get(
    '@test/package-g/lib/bar'
  );
  expect(fooEntry).toBe(pkgGInfo.files.get(FILE_G_FOO));
  expect(barEntry).toBe(pkgGInfo.files.get(FILE_G_BAR));
  expect(fooEntry?.entryPointSpecifier).toBe('@test/package-g/lib/foo');
  expect(barEntry?.entryPointSpecifier).toBe('@test/package-g/lib/bar');
});

it('Dynamic entry point: cross-package singleImport lights up only the matching wildcard expansion', () => {
  initialize();

  const pkgGInfo = getPackageInfo(PACKAGE_G_DIR);
  const fooFile = pkgGInfo.packageEntryPointExports.get(
    '@test/package-g/lib/foo'
  );
  assertDefined(
    fooFile,
    '@test/package-g/lib/foo entry point missing on packageG'
  );
  const fooExport = findExport(fooFile, 'Foo');
  assertDefined(fooExport, 'Foo export missing on @test/package-g/lib/foo');

  expect(fooExport.externallyImportedBy).toHaveLength(1);
  expect(fooExport.externallyImportedBy[0]).toMatchObject({
    packageRootDir: PACKAGE_H_DIR,
    filePath: FILE_H,
    importEntry: {
      type: 'singleImport',
      importName: 'Foo',
      moduleSpecifier: '@test/package-g/lib/foo',
    },
  });
  expectNoDuplicateExternalImporters(fooExport.externallyImportedBy);

  const barFile = pkgGInfo.packageEntryPointExports.get(
    '@test/package-g/lib/bar'
  );
  assertDefined(
    barFile,
    '@test/package-g/lib/bar entry point missing on packageG'
  );
  const barExport = findExport(barFile, 'Bar');
  assertDefined(barExport, 'Bar export missing on @test/package-g/lib/bar');
  expect(barExport.externallyImportedBy).toEqual([]);
});

// ─── Ambiguous entry-point patterns ─────────────────────────────────────────
//
// When two entry-point patterns both match the same file, the
// `getGetEntryPointSpecifier` factory's returned function throws to avoid
// silently picking one specifier over another. We reuse packageF's fixture
// directory (which has `a.ts` and `b.ts`) but supply synthesized
// `ParsedPackageSettings` with a static `.` → `./a.ts` entry AND a dynamic
// `./*` → `./*.ts` entry. `a.ts` matches both, producing the throw.

it('Ambiguous static + dynamic entry points throw during package initialization', () => {
  const settings: ParsedPackageSettings = {
    repoRootDir: MONOREPO_DIR,
    packageRootDir: PACKAGE_F_DIR,
    packageName: '@test/package-f',
    wildcardAliases: {},
    fixedAliases: {},
    entryPoints: [
      { type: 'static', subPath: '.', filePath: './a.ts' },
      {
        type: 'dynamic',
        subPathPattern: './*',
        filePattern: /^\.\/(.*)\.ts$/,
      },
    ],
    externallyImported: [],
    ignorePatterns: [],
    ignoreOverridePatterns: [],
    defaultIgnoreOverrides: [],
    testFilePatterns: [],
  };

  expect(() => initializePackage(settings)).toThrow(
    /Multiple entry points matched for file ".*a\.ts"\. Entry points must not be ambiguous\./
  );
});

it('Ambiguous dynamic + dynamic entry points throw during package initialization', () => {
  // Two wildcard patterns that both match the same file. Regardless of which
  // subpath prefixes they use (`./*` vs. `./alt/*`), the underlying file
  // pattern collides on `a.ts`, so the factory must throw before settling on
  // a specifier.
  const settings: ParsedPackageSettings = {
    repoRootDir: MONOREPO_DIR,
    packageRootDir: PACKAGE_F_DIR,
    packageName: '@test/package-f',
    wildcardAliases: {},
    fixedAliases: {},
    entryPoints: [
      {
        type: 'dynamic',
        subPathPattern: './*',
        filePattern: /^\.\/(.*)\.ts$/,
      },
      {
        type: 'dynamic',
        subPathPattern: './alt/*',
        filePattern: /^\.\/(.*)\.ts$/,
      },
    ],
    externallyImported: [],
    ignorePatterns: [],
    ignoreOverridePatterns: [],
    defaultIgnoreOverrides: [],
    testFilePatterns: [],
  };

  expect(() => initializePackage(settings)).toThrow(
    /Multiple entry points matched for file ".*\.ts"\. Entry points must not be ambiguous\./
  );
});
