import { readFileSync } from 'node:fs';
import { dirname, relative } from 'node:path';

import { TSError } from '@typescript-eslint/typescript-estree';
import type { TSESTree } from '@typescript-eslint/utils';

import {
  getAllPackageSettings,
  type ParsedPackageSettings,
} from '../settings/settings.js';
import type {
  AnalyzedBarrelImport,
  AnalyzedBarrelReexport,
  AnalyzedDynamicImport,
  AnalyzedPackageInfo,
  AnalyzedSideEffectImport,
  AnalyzedSingleImport,
  AnalyzedSingleReexport,
} from '../types/analyzed.js';
import type { BasePackageInfo } from '../types/base.js';
import type { GenericContext } from '../types/context.js';
import type { ResolvedPackageInfo } from '../types/resolved.js';
import { isCodeFile } from '../util/code.js';
import {
  exitWithError,
  exitWithException,
  exitWithInternalError,
} from '../util/error.js';
import {
  convertToUnixishPath,
  getDependenciesFromPackageJson,
  getRelativePathFromRoot,
} from '../util/files.js';
import { getSubpathEntry } from '../util/getSubpathEntry.js';
import { debug, formatMilliseconds } from '../util/logging.js';
import { computeAnalyzedInfo } from './computeAnalyzedInfo.js';
import {
  addBaseInfoForFile,
  computeBaseInfo,
  deleteBaseInfoForFile,
  updateBaseInfoForFile,
} from './computeBaseInfo.js';
import { computeRepoInfo } from './computeRepoInfo.js';
import {
  addResolvedInfoForFile,
  computeFolderTree,
  computeResolvedInfo,
  deleteResolvedInfoForFile,
  updateResolvedInfoForFile,
} from './computeResolvedInfo.js';

// When running in monorepos, we need to track package info for each root dir
// separately, since they have different root dirs, entry points, etc. To
// support this, we use a map from root dir to package info.

const basePackageInfos = new Map<string, BasePackageInfo>();
function getBasePackageInfo(filename: string) {
  return getSubpathEntry({
    filePath: filename,
    data: basePackageInfos,
  });
}

const resolvedPackageInfos = new Map<string, ResolvedPackageInfo>();
function getResolvedPackageInfo(filename: string) {
  return getSubpathEntry({
    filePath: filename,
    data: resolvedPackageInfos,
  });
}

const analyzedPackageInfos = new Map<string, AnalyzedPackageInfo>();
function getAnalyzedPackageInfo(filename: string) {
  return getSubpathEntry({
    filePath: filename,
    data: analyzedPackageInfos,
  });
}

function getGetEntryPointSpecifier({
  packageRootDir,
  packageName,
  entryPoints,
}: {
  packageRootDir: string;
  packageName: string | undefined;
  entryPoints: ParsedPackageSettings['entryPoints'];
}) {
  if (!packageName) {
    return () => undefined;
  }
  return (filePath: string) => {
    const relativePath =
      './' +
      convertToUnixishPath(getRelativePathFromRoot(packageRootDir, filePath));
    let entryPointSpecifier: string | undefined;
    for (const entryPoint of entryPoints) {
      if (entryPoint.type === 'dynamic') {
        // First we run the regex to see if it matches. If it does match, then
        // the wildcard pattern is the lone matched group
        const filePatternMatch = entryPoint.filePattern.exec(relativePath);
        if (!filePatternMatch) {
          continue;
        }

        if (entryPointSpecifier) {
          exitWithError(
            `Multiple entry points matched for file "${filePath}". Entry points must not be ambiguous.`
          );
        }

        // Now we replace the wildcard pattern with the matched group from the
        // file pattern. Technically speaking
        const subPath = entryPoint.subPathPattern.replace(
          '*',
          filePatternMatch[1]
        );
        entryPointSpecifier = `${packageName}${subPath.slice(1)}`;
      } else {
        if (entryPoint.filePath === relativePath) {
          if (entryPointSpecifier) {
            exitWithError(
              `Multiple entry points matched for file "${filePath}". Entry points must not be ambiguous.`
            );
          }
          entryPointSpecifier = `${packageName}${entryPoint.subPath.slice(1)}`;
        }
      }
    }
    return entryPointSpecifier;
  };
}

function getIsExternallyImportedCheck(
  packageRootDir: string,
  externallyImported: ParsedPackageSettings['externallyImported']
) {
  return (filePath: string) => {
    for (const { file } of externallyImported) {
      // We're using the ignore library in reverse fashion: we're using it to
      // identify when a file is _included_, not _excluded_. We also have to
      // be careful with Windows styled paths, since gitignores use unix paths
      // even on Windows.
      if (
        file.ignores(
          convertToUnixishPath(
            getRelativePathFromRoot(packageRootDir, filePath)
          )
        )
      ) {
        return true;
      }
    }
    return false;
  };
}

// We need to reset settings between runs, since some tests try different settings
export function _testOnlyResetPackageInfo() {
  basePackageInfos.clear();
  resolvedPackageInfos.clear();
  analyzedPackageInfos.clear();
}

export function initializeRepo(
  context: Pick<GenericContext, 'filename' | 'settings'>
) {
  const { allPackageSettings } = getAllPackageSettings(context);
  let hasChanges = false;
  for (const packageSettings of allPackageSettings) {
    const packageHasChanges = initializePackage(packageSettings);
    hasChanges ||= packageHasChanges;
  }
  if (hasChanges) {
    initializeRepoInfo();
  }
}

// Testing this logic through initializeRepo would be more difficult than just
// testing this function directly, since we'd have to create full packages
// eslint-disable-next-line import-integrity/no-test-only-imports
export function initializePackage({
  packageRootDir,
  repoRootDir,
  packageName,
  wildcardAliases,
  fixedAliases,
  ignorePatterns,
  ignoreOverridePatterns,
  defaultIgnoreOverrides,
  entryPoints,
  externallyImported,
}: ParsedPackageSettings): boolean {
  // If we've already analyzed the package and settings haven't changed, bail
  if (
    getBasePackageInfo(packageRootDir) &&
    getResolvedPackageInfo(packageRootDir) &&
    getAnalyzedPackageInfo(packageRootDir)
  ) {
    return false;
  }

  const baseStart = performance.now();
  const basePackageInfo = computeBaseInfo({
    packageRootDir,
    packageName,
    wildcardAliases,
    fixedAliases,
    ignorePatterns,
    ignoreOverridePatterns,
    defaultIgnoreOverrides,
    getEntryPointSpecifier: getGetEntryPointSpecifier({
      packageRootDir,
      packageName,
      entryPoints,
    }),
    isExternallyImportedCheck: getIsExternallyImportedCheck(
      packageRootDir,
      externallyImported
    ),
  });
  basePackageInfos.set(packageRootDir, basePackageInfo);
  const baseEnd = performance.now();

  const resolveStart = performance.now();
  const resolvedPackageInfo = computeResolvedInfo(basePackageInfo);
  resolvedPackageInfos.set(packageRootDir, resolvedPackageInfo);
  const resolveEnd = performance.now();

  const analyzestart = performance.now();
  const analyzedPackageInfo = computeAnalyzedInfo(resolvedPackageInfo);
  analyzedPackageInfos.set(packageRootDir, analyzedPackageInfo);
  const analyzeEnd = performance.now();

  if (packageRootDir !== repoRootDir) {
    debug(
      `Initial computation files complete for ${relative(repoRootDir, packageRootDir)}`
    );
  } else {
    debug(`Initial computation files complete :`);
  }
  debug(`  total:         ${formatMilliseconds(analyzeEnd - baseStart)}`);
  debug(`  base info:     ${formatMilliseconds(baseEnd - baseStart)}`);
  debug(`  resolved info: ${formatMilliseconds(resolveEnd - resolveStart)}`);
  debug(`  analyzed info: ${formatMilliseconds(analyzeEnd - analyzestart)}`);

  let numImports = 0;
  let numExports = 0;
  let numReexports = 0;
  for (const [, fileDetails] of analyzedPackageInfo.files) {
    if (fileDetails.fileType !== 'code') {
      continue;
    }
    numImports += fileDetails.singleImports.length;
    numImports += fileDetails.barrelImports.length;
    numImports += fileDetails.dynamicImports.length;
    numImports += fileDetails.sideEffectImports.length;
    numExports += fileDetails.exports.length;
    numReexports += fileDetails.singleReexports.length;
    numReexports += fileDetails.barrelReexports.length;
  }

  debug(
    `  Package contains ${analyzedPackageInfo.files.size.toLocaleString()} files with:`
  );
  debug(`    ${numImports.toLocaleString()} imports`);
  debug(`    ${numExports.toLocaleString()} exports`);
  debug(`    ${numReexports.toLocaleString()} reexports`);

  return true;
}

function initializeRepoInfo() {
  const analyzestart = performance.now();
  computeRepoInfo(analyzedPackageInfos);
  const analyzeEnd = performance.now();
  debug(
    `Initialized cross-package info in ${formatMilliseconds(analyzeEnd - analyzestart)}`
  );
}

export function getPackageInfo(packageRootDir: string) {
  const analyzedPackageInfo = getAnalyzedPackageInfo(packageRootDir);
  /* istanbul ignore if */
  if (!analyzedPackageInfo) {
    exitWithInternalError('Package info requested before initialization');
  }
  return analyzedPackageInfo;
}

type Changes = {
  added: Array<{
    filePath: string;
    latestUpdatedAt: number;
  }>;
  deleted: string[];
  modified: Array<{
    filePath: string;
    latestUpdatedAt: number;
  }>;
};

// Batch updates file changes. Note that the order of operations (delete, then
// add, then modified) is critical
export function updateCacheFromFileSystem({
  repoRootDir,
  packageRootDir,
  changes,
  packageJsons,
  packageSettings,
  operationStart,
}: {
  repoRootDir: string;
  packageRootDir: string;
  changes: Changes;
  packageJsons: string[];
  packageSettings: ParsedPackageSettings;
  operationStart: number;
}) {
  const basePackageInfo = getBasePackageInfo(packageRootDir);
  let resolvedPackageInfo = getResolvedPackageInfo(packageRootDir);
  let analyzedPackageInfo = getAnalyzedPackageInfo(packageRootDir);

  // This shouldn't be possible and is just to make sure TypeScript is happy
  /* istanbul ignore if */
  if (!basePackageInfo || !resolvedPackageInfo || !analyzedPackageInfo) {
    exitWithInternalError('Package info not initialized');
  }

  // First update the dependencies list
  for (const packageJson of packageJsons) {
    analyzedPackageInfo.availableThirdPartyDependencies.set(
      dirname(packageJson),
      getDependenciesFromPackageJson(packageJson)
    );
  }

  // We may have a list of added/deleted/modified files from the file system,
  // but there's a chance we've already processed those changes through an
  // editor change. We track whether or not the list actually caused in changes.
  // We use this counter to track these actual changes
  let numDeletes = 0;
  let numAdditions = 0;
  let numModified = 0;

  // First, process any file deletes
  const baseStart = performance.now();
  for (const filePath of changes.deleted) {
    if (basePackageInfo.files.has(filePath)) {
      numDeletes++;
      deleteResolvedInfoForFile(filePath, basePackageInfo, resolvedPackageInfo);
      deleteBaseInfoForFile(filePath, basePackageInfo);
    }
  }
  const baseEnd = performance.now();

  // Next, process any file adds
  const resolveStart = performance.now();
  for (const { filePath } of changes.added) {
    // We might already have this new file in memory if it was created in editor
    // and previously linted while it was only in memory
    if (!basePackageInfo.files.has(filePath)) {
      try {
        if (isCodeFile(filePath)) {
          const fileContents = readFileSync(filePath, 'utf-8');
          addBaseInfoForFile(
            {
              filePath,
              fileContents,
              getEntryPointSpecifier: getGetEntryPointSpecifier({
                packageRootDir: packageSettings.packageRootDir,
                packageName: packageSettings.packageName,
                entryPoints: packageSettings.entryPoints,
              }),
              isExternallyImportedCheck: getIsExternallyImportedCheck(
                packageSettings.packageRootDir,
                packageSettings.externallyImported
              ),
            },
            basePackageInfo
          );
        } else {
          basePackageInfo.files.set(filePath, {
            fileType: 'other',
          });
        }
        numAdditions++;
      } catch (e) {
        // If we failed to parse due to a syntax error, bail silently since this
        // is due to user-error and we don't want to clutter up the output
        if (e instanceof TSError) {
          debug(`Could not parse ${filePath}, reusing previously parsed info`);
          return;
        }
        exitWithException(e);
      }
    }
  }

  // If we added or deleted any files, we fully recompute resolutions to take
  // these changes into account, since files may have been renamed. Renames are
  // especially tricky since it may just be an extension change(.js->.ts), and
  // we might have already seen the new .ts file in a previous update.
  // TODO: it's probably possible to do a more performant+surgical recomputation
  if (numDeletes || numAdditions) {
    resolvedPackageInfo = computeResolvedInfo(basePackageInfo);
    resolvedPackageInfos.set(packageRootDir, resolvedPackageInfo);
  }
  const resolveEnd = performance.now();

  // Next, process any modified files
  for (const { filePath, latestUpdatedAt } of changes.modified) {
    const previousFileInfo = basePackageInfo.files.get(filePath);
    if (
      isCodeFile(filePath) &&
      (!previousFileInfo ||
        (previousFileInfo.fileType === 'code' &&
          previousFileInfo.lastUpdatedAt < latestUpdatedAt))
    ) {
      numModified++;
      try {
        const fileContents = readFileSync(filePath, 'utf-8');
        updateBaseInfoForFile(
          {
            filePath,
            fileContents,
            getEntryPointSpecifier: getGetEntryPointSpecifier({
              packageRootDir: packageSettings.packageRootDir,
              packageName: packageSettings.packageName,
              entryPoints: packageSettings.entryPoints,
            }),
            isExternallyImportedCheck: getIsExternallyImportedCheck(
              packageSettings.packageRootDir,
              packageSettings.externallyImported
            ),
          },
          basePackageInfo
        );
      } catch (e) {
        // If we failed to parse due to a syntax error, bail silently since this
        // is due to user-error and we don't want to clutter up the output
        if (e instanceof TSError) {
          debug(`Could not parse ${filePath}, reusing previously parsed info`);
          return;
        }
        exitWithException(e);
      }
      updateResolvedInfoForFile(filePath, basePackageInfo, resolvedPackageInfo);
    }
  }

  // Finally, recompute analyzed info
  if (numDeletes || numAdditions | numModified) {
    const analyzestart = performance.now();
    analyzedPackageInfo = computeAnalyzedInfo(resolvedPackageInfo);
    analyzedPackageInfos.set(packageRootDir, analyzedPackageInfo);
    const analyzeEnd = performance.now();

    // Note: it's not the most efficient to recompute this here, since this can
    // lead to multiple recomputations if multiple files across packages are
    // modified at once. However, rearchitecting this would be complicated, and
    // given how fast this operation is to begin with, it's not worth the effort.
    const packageInfoStart = performance.now();
    initializeRepoInfo();
    const packageInfoEnd = performance.now();

    const packageLabel =
      repoRootDir !== packageRootDir
        ? ` for ${relative(repoRootDir, packageRootDir)}`
        : '';
    debug(
      `Synchronized changes${packageLabel} from filesystem (deleted=${numDeletes.toLocaleString()} added=${numAdditions.toLocaleString()} modified=${numModified.toLocaleString()}):`
    );
    debug(
      `  total:         ${formatMilliseconds(analyzeEnd - operationStart)}`
    );
    debug(`  base info:     ${formatMilliseconds(baseEnd - baseStart)}`);
    debug(`  resolved info: ${formatMilliseconds(resolveEnd - resolveStart)}`);
    debug(`  analyzed info: ${formatMilliseconds(analyzeEnd - analyzestart)}`);
    debug(
      `  package info:  ${formatMilliseconds(packageInfoEnd - packageInfoStart)}`
    );

    return true;
  }
  return false;
}

export function updateCacheForFile({
  filePath,
  fileContents,
  ast,
  packageSettings: {
    entryPoints,
    externallyImported,
    packageRootDir,
    repoRootDir,
    packageName,
  },
}: {
  filePath: string;
  fileContents: string;
  ast: TSESTree.Program;
  packageSettings: ParsedPackageSettings;
}) {
  const basePackageInfo = getBasePackageInfo(filePath);
  const resolvedPackageInfo = getResolvedPackageInfo(filePath);
  const analyzedPackageInfo = getAnalyzedPackageInfo(filePath);

  // This shouldn't be possible and is just to make sure TypeScript is happy
  /* istanbul ignore if */
  if (!basePackageInfo || !resolvedPackageInfo || !analyzedPackageInfo) {
    exitWithInternalError('Package info not initialized');
  }

  const baseOptions = {
    filePath,
    fileContents,
    ast,
    getEntryPointSpecifier: getGetEntryPointSpecifier({
      packageRootDir,
      packageName,
      entryPoints,
    }),
    isExternallyImportedCheck: getIsExternallyImportedCheck(
      packageRootDir,
      externallyImported
    ),
  };

  // Check if we're updating file info or adding a new file
  if (analyzedPackageInfo.files.has(filePath)) {
    const baseStart = performance.now();
    const shouldUpdateDerivedPackageInfo = updateBaseInfoForFile(
      baseOptions,
      basePackageInfo
    );
    const baseEnd = performance.now();

    // If we don't need to update
    if (shouldUpdateDerivedPackageInfo) {
      const resolveStart = performance.now();
      updateResolvedInfoForFile(filePath, basePackageInfo, resolvedPackageInfo);
      const resolveEnd = performance.now();

      const analyzeStart = performance.now();
      const analyzedPackageInfo = computeAnalyzedInfo(resolvedPackageInfo);
      analyzedPackageInfos.set(packageRootDir, analyzedPackageInfo);
      const analyzeEnd = performance.now();

      const packageInfoStart = performance.now();
      initializeRepoInfo();
      const packageInfoEnd = performance.now();

      debug(`Update for ${filePath.replace(packageRootDir, '')} complete:`);
      debug(`  total:         ${formatMilliseconds(analyzeEnd - baseStart)}`);
      debug(`  base info:     ${formatMilliseconds(baseEnd - baseStart)}`);
      debug(
        `  resolved info: ${formatMilliseconds(resolveEnd - resolveStart)}`
      );
      debug(
        `  analyzed info: ${formatMilliseconds(analyzeEnd - analyzeStart)}`
      );
      debug(
        `  package info:  ${formatMilliseconds(packageInfoEnd - packageInfoStart)}`
      );

      return true;
    } else {
      // Even if we don't need to update information we compute, we still need
      // to update the AST nodes to take into account potentially changed locs
      const baseFileInfo = basePackageInfo.files.get(filePath);
      const resolvedFileInfo = resolvedPackageInfo.files.get(filePath);
      const analyzedFileInfo = analyzedPackageInfo.files.get(filePath);
      /* istanbul ignore if */
      if (
        !baseFileInfo ||
        baseFileInfo.fileType !== 'code' ||
        !resolvedFileInfo ||
        resolvedFileInfo.fileType !== 'code' ||
        !analyzedFileInfo ||
        analyzedFileInfo.fileType !== 'code'
      ) {
        exitWithInternalError(`Could not get file info for "${filePath}"`);
      }
      for (let i = 0; i < baseFileInfo.exports.length; i++) {
        resolvedFileInfo.exports[i] = {
          ...resolvedFileInfo.exports[i],
          ...baseFileInfo.exports[i],
        };
        analyzedFileInfo.exports[i] = {
          ...analyzedFileInfo.exports[i],
          ...resolvedFileInfo.exports[i],
        };
      }

      for (let i = 0; i < baseFileInfo.singleImports.length; i++) {
        resolvedFileInfo.singleImports[i] = {
          ...resolvedFileInfo.singleImports[i],
          ...baseFileInfo.singleImports[i],
        };
        analyzedFileInfo.singleImports[i] = {
          ...analyzedFileInfo.singleImports[i],
          ...resolvedFileInfo.singleImports[i],
        } as AnalyzedSingleImport;
      }

      for (let i = 0; i < baseFileInfo.barrelImports.length; i++) {
        resolvedFileInfo.barrelImports[i] = {
          ...resolvedFileInfo.barrelImports[i],
          ...baseFileInfo.barrelImports[i],
        };
        analyzedFileInfo.barrelImports[i] = {
          ...analyzedFileInfo.barrelImports[i],
          ...resolvedFileInfo.barrelImports[i],
        } as AnalyzedBarrelImport;
      }

      for (let i = 0; i < baseFileInfo.dynamicImports.length; i++) {
        resolvedFileInfo.dynamicImports[i] = {
          ...resolvedFileInfo.dynamicImports[i],
          ...baseFileInfo.dynamicImports[i],
        };
        analyzedFileInfo.dynamicImports[i] = {
          ...analyzedFileInfo.dynamicImports[i],
          ...resolvedFileInfo.dynamicImports[i],
        } as AnalyzedDynamicImport;
      }

      for (let i = 0; i < baseFileInfo.sideEffectImports.length; i++) {
        resolvedFileInfo.sideEffectImports[i] = {
          ...resolvedFileInfo.sideEffectImports[i],
          ...baseFileInfo.sideEffectImports[i],
        };
        analyzedFileInfo.sideEffectImports[i] = {
          ...analyzedFileInfo.sideEffectImports[i],
          ...resolvedFileInfo.sideEffectImports[i],
        } as AnalyzedSideEffectImport;
      }

      for (let i = 0; i < baseFileInfo.singleReexports.length; i++) {
        resolvedFileInfo.singleReexports[i] = {
          ...resolvedFileInfo.singleReexports[i],
          ...baseFileInfo.singleReexports[i],
        };
        analyzedFileInfo.singleReexports[i] = {
          ...analyzedFileInfo.singleReexports[i],
          ...resolvedFileInfo.singleReexports[i],
        } as AnalyzedSingleReexport;
      }

      for (let i = 0; i < baseFileInfo.barrelReexports.length; i++) {
        resolvedFileInfo.barrelReexports[i] = {
          ...resolvedFileInfo.barrelReexports[i],
          ...baseFileInfo.barrelReexports[i],
        };
        analyzedFileInfo.barrelReexports[i] = {
          ...analyzedFileInfo.barrelReexports[i],
          ...resolvedFileInfo.barrelReexports[i],
        } as AnalyzedBarrelReexport;
      }

      return false;
    }
  } else {
    const baseStart = performance.now();
    addBaseInfoForFile(baseOptions, basePackageInfo);
    const baseEnd = performance.now();

    const resolveStart = performance.now();
    computeFolderTree(basePackageInfo);
    addResolvedInfoForFile(filePath, basePackageInfo, resolvedPackageInfo);
    const resolveEnd = performance.now();

    const anazlyzeStart = performance.now();
    const analyzedPackageInfo = computeAnalyzedInfo(resolvedPackageInfo);
    analyzedPackageInfos.set(packageRootDir, analyzedPackageInfo);
    const analyzeEnd = performance.now();

    const packageInfoStart = performance.now();
    initializeRepoInfo();
    const packageInfoEnd = performance.now();

    debug(`${filePath.replace(repoRootDir, '')} add complete:`);
    debug(`  total:         ${formatMilliseconds(analyzeEnd - baseStart)}`);
    debug(`  base info:     ${formatMilliseconds(baseEnd - baseStart)}`);
    debug(`  resolved info: ${formatMilliseconds(resolveEnd - resolveStart)}`);
    debug(`  analyzed info: ${formatMilliseconds(analyzeEnd - anazlyzeStart)}`);
    debug(
      `  package info:  ${formatMilliseconds(packageInfoEnd - packageInfoStart)}`
    );

    return true;
  }
}
