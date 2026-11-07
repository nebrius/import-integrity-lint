import type {
  AnalyzedCodeFileDetails,
  AnalyzedPackageInfo,
} from '../types/analyzed.js';

/**
 * Computes cross-package import info.
 */
export function computeRepoInfo(
  analyzedPackageInfos: Map<string, AnalyzedPackageInfo>
) {
  const packageImportMap = new Map<string, AnalyzedCodeFileDetails>();

  // Initialize the package dependencies map
  for (const [, analyzedPackageInfo] of analyzedPackageInfos) {
    if (analyzedPackageInfo.packageName) {
      for (const [
        ,
        fileDetails,
      ] of analyzedPackageInfo.packageEntryPointExports) {
        if (fileDetails.entryPointSpecifier) {
          packageImportMap.set(fileDetails.entryPointSpecifier, fileDetails);
        }
      }
    }
  }

  // Reset externallyImportedBy arrays. Since we don't do more intelligent cache
  // updates for package info, we have to first reset externallyImportedBy
  // arrays, otherwise we end up with duplicates. Reexport entries receive
  // pushes below just like exports do, so they need the same reset.
  for (const [, analyzedPackageInfo] of analyzedPackageInfos) {
    for (const [, fileDetails] of analyzedPackageInfo.files) {
      if (fileDetails.fileType !== 'code') {
        continue;
      }
      for (const exportEntry of [
        ...fileDetails.exports,
        ...fileDetails.singleReexports,
        ...fileDetails.barrelReexports,
      ]) {
        exportEntry.externallyImportedBy = [];
      }
    }
  }

  // Mark entry points as imported in the monorepo
  for (const [, analyzedPackageInfo] of analyzedPackageInfos) {
    for (const [filePath, fileDetails] of analyzedPackageInfo.files) {
      if (fileDetails.fileType !== 'code') {
        continue;
      }

      // We don't include side effect imports because they don't import any
      // actual exports, and thus we should make any of them as exprted
      for (const importEntry of [
        ...fileDetails.singleImports,
        ...fileDetails.barrelImports,
        ...fileDetails.dynamicImports,
      ]) {
        if (importEntry.resolvedModuleType !== 'thirdParty') {
          continue;
        }

        // A dynamic import with a non-literal specifier is never third party
        // (it can't be resolved at all), but the type doesn't know that
        /* istanbul ignore if */
        if (importEntry.moduleSpecifier === undefined) {
          continue;
        }

        // Check if this is a known package in the monorepo or not. If it's not
        // then that means it's a true third party module from npm
        const fileDetails = packageImportMap.get(importEntry.moduleSpecifier);
        if (!fileDetails) {
          continue;
        }
        switch (importEntry.type) {
          // For single imports, we need to find the specific export so we can
          // mark it as externally imported
          case 'singleImport': {
            for (const exportEntry of [
              ...fileDetails.exports,
              ...fileDetails.singleReexports,
              ...fileDetails.barrelReexports,
            ]) {
              if (exportEntry.exportName === importEntry.importName) {
                exportEntry.externallyImportedBy.push({
                  packageRootDir: analyzedPackageInfo.packageRootDir,
                  filePath,
                  importEntry,
                });
                break;
              }
            }
            break;
          }
          // For barrel imports and dynamic imports, we mark all exports as externally imported
          case 'dynamicImport':
          case 'barrelImport': {
            for (const exportEntry of [
              ...fileDetails.exports,
              ...fileDetails.singleReexports,
              ...fileDetails.barrelReexports,
            ]) {
              if (!exportEntry.exportName) {
                continue;
              }
              exportEntry.externallyImportedBy.push({
                packageRootDir: analyzedPackageInfo.packageRootDir,
                filePath,
                importEntry,
              });
            }
            break;
          }
        }
      }
    }
  }
}
