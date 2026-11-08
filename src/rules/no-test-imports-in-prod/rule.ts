import type {
  AnalyzedBarrelImport,
  AnalyzedBarrelReexport,
  AnalyzedDynamicImport,
  AnalyzedPackageInfo,
  AnalyzedSideEffectImport,
  AnalyzedSingleImport,
  AnalyzedSingleReexport,
} from '../../types/analyzed.js';
import {
  createRule,
  getESMInfo,
  getLocFromRange,
  isNonTestFile,
  isTestOnlyName,
  isTypeOnly,
} from '../util.js';

// Every statement the loop in `create` walks. A side-effect import imports
// nothing, so phase 3 never records it as reaching anything and it is never
// in the index; it is in this union so the loop can treat every statement
// alike, since a miss is the right answer for it.
type ImportEntry =
  | AnalyzedSingleImport
  | AnalyzedBarrelImport
  | AnalyzedDynamicImport
  | AnalyzedSideEffectImport
  | AnalyzedSingleReexport
  | AnalyzedBarrelReexport;

// For each package, every import/reexport entry whose resolution reaches a
// `_testOnly` export, either by name or as a member of a namespace object it
// yields, mapped to that export's name. Phase 3 already records the inverse
// relation on each export (`importedBy` / `barrelImportedBy`), so this is one
// pass over the package per analysis, inverted.
//
// Keyed by the analyzed package info object: phase 3 builds a new object on
// every recompute, so a stale index is simply never found again, and a
// range-only cache update keeps entry identity, so lookups by the entry
// objects in `fileInfo` stay valid.
const testOnlyReachIndexes = new WeakMap<
  AnalyzedPackageInfo,
  Map<ImportEntry, string>
>();

function getTestOnlyReachIndex(packageInfo: AnalyzedPackageInfo) {
  const cached = testOnlyReachIndexes.get(packageInfo);
  if (cached) {
    return cached;
  }
  const index = new Map<ImportEntry, string>();

  // A statement can reach several `_testOnly` exports, and naming any of them
  // is a true report. Keep the smallest name so the message depends only on
  // what the statement reaches. File walk order would not do: files added in
  // fix and editor mode go to the end of the map instead of where discovery
  // would sort them.
  function record(importEntry: ImportEntry, name: string) {
    const previous = index.get(importEntry);
    if (previous === undefined || name < previous) {
      index.set(importEntry, name);
    }
  }

  for (const [, fileDetails] of packageInfo.files) {
    if (fileDetails.fileType !== 'code') {
      continue;
    }
    for (const exportEntry of [
      ...fileDetails.exports,
      ...fileDetails.singleReexports,
      ...fileDetails.barrelReexports,
    ]) {
      const name = exportEntry.exportName;
      if (name === undefined || !isTestOnlyName(name)) {
        continue;
      }
      for (const { importEntry } of exportEntry.importedBy) {
        record(importEntry, name);
      }
      for (const { importEntry } of exportEntry.barrelImportedBy) {
        record(importEntry, name);
      }
    }
  }
  testOnlyReachIndexes.set(packageInfo, index);
  return index;
}

export const noTestImportsInProd = createRule({
  name: 'no-test-imports-in-prod',
  meta: {
    docs: {
      description: 'Ensures that production code does not import test code',
    },
    schema: [],
    fixable: undefined,
    type: 'problem',
    messages: {
      noTestImports: 'Test code should not be imported in production code',
      noTestOnlyReach:
        'Import exposes test-only export "{{name}}" to production code',
      noTestOnlyReexport:
        'Re-export exposes test-only export "{{name}}" outside the package',
    },
    defaultOptions: [],
  },
  create(context) {
    const esmInfo = getESMInfo(context);

    // No package info means this file wasn't found as part of the package, e.g.
    // because it's ignored
    /* istanbul ignore if */
    if (!esmInfo) {
      return {};
    }

    const { fileInfo, packageInfo } = esmInfo;
    if (fileInfo.fileType !== 'code' || !isNonTestFile(context.filename)) {
      return {};
    }

    const testOnlyReach = getTestOnlyReachIndex(packageInfo);

    for (const importEntry of [
      ...fileInfo.singleImports,
      ...fileInfo.barrelImports,
      ...fileInfo.dynamicImports,
      ...fileInfo.sideEffectImports,
      ...fileInfo.singleReexports,
      ...fileInfo.barrelReexports,
    ]) {
      if (
        importEntry.resolvedModuleType !== 'firstPartyCode' &&
        importEntry.resolvedModuleType !== 'firstPartyOther'
      ) {
        continue;
      }
      if (
        // First check if the imported file is a test file
        (importEntry.resolvedModulePath &&
          !isNonTestFile(importEntry.resolvedModulePath)) ||
        // Now check if the imported symbol is in production but intended to be
        // test only
        ('importName' in importEntry && isTestOnlyName(importEntry.importName))
      ) {
        context.report({
          loc: getLocFromRange(context, importEntry.reportNodeRange),
          messageId: 'noTestImports',
        });
        continue;
      }

      // Finally, check if the statement reaches a `_testOnly` export without
      // naming it: through a namespace object (`import * as`, `import()`, an
      // `export * as` it resolves to) or through a renamed re-export. An import
      // exposes it to this file. A reexport only appears in the index when it
      // is an entry point or externally imported (those are the only reexports
      // phase 3 traces), so it exposes it to every consumer of the package. A
      // type-only statement is erased at compile time, so it exposes nothing.
      if (isTypeOnly(importEntry)) {
        continue;
      }
      const testOnlyName = testOnlyReach.get(importEntry);
      if (testOnlyName !== undefined) {
        context.report({
          loc: getLocFromRange(context, importEntry.reportNodeRange),
          messageId:
            importEntry.type === 'singleReexport' ||
            importEntry.type === 'barrelReexport'
              ? 'noTestOnlyReexport'
              : 'noTestOnlyReach',
          data: { name: testOnlyName },
        });
      }
    }

    return {};
  },
});
