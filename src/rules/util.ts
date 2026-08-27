import type { TSESTree } from '@typescript-eslint/utils';
import { ESLintUtils } from '@typescript-eslint/utils';

import {
  getPackageInfo,
  initializeRepo,
  updateCacheForFile,
  updateCacheFromFileSystem,
} from '../module/module.js';
import type {
  ParsedPackageSettings,
  ParsedRepoSettings,
} from '../settings/settings.js';
import {
  getAllPackageSettings,
  getPackageCacheEntryForFile,
  getRepoSettings,
  markSettingsForRefresh,
} from '../settings/settings.js';
import type { GenericContext } from '../types/context.js';
import { exitWithInternalError } from '../util/error.js';
import {
  convertToUnixishPath,
  getFiles,
  getRelativePathFromRoot,
  isFileIgnored,
} from '../util/files.js';

export const createRule = ESLintUtils.RuleCreator(
  (name) =>
    `https://github.com/nebrius/import-integrity-lint/tree/main/src/rules/${name}/README.md`
);

const updateListeners = new Set<(packageRootDir: string) => void>();
export function registerUpdateListener(cb: (packageRootDir: string) => void) {
  updateListeners.add(cb);
}

export function getESMInfo(context: GenericContext) {
  initializeRepo(context);

  // If we don't have package settings at this point, that means the file lives
  // outside of a package, and we can't do anything
  const repoSettings = getRepoSettings(context);
  const { packageSettings } = getAllPackageSettings(context);
  if (!packageSettings) {
    return;
  }

  // We have to call initializePackage first before we can check if this file
  // is ignored, because initializePackage initializes the ignore cache
  if (isFileIgnored(packageSettings.packageRootDir, context.filename)) {
    return;
  }

  // If we're not in one-shot mode, update the cache, and if there were changes
  // call any esm change subscribers
  if (
    repoSettings.mode !== 'one-shot' &&
    updateCacheForFile({
      filePath: context.filename,
      fileContents: context.sourceCode.getText(),
      ast: context.sourceCode.ast,
      packageSettings,
    })
  ) {
    for (const updateListener of updateListeners) {
      updateListener(packageSettings.packageRootDir);
    }
  }

  const packageInfo = getPackageInfo(packageSettings.packageRootDir);

  // Initialize file watching if we're in editor mode
  if (repoSettings.mode === 'editor') {
    void initializeFileWatching(repoSettings, packageSettings);
  }

  // Format and return the ESM info
  const fileInfo = packageInfo.files.get(context.filename);
  if (!fileInfo) {
    return;
  }
  return {
    fileInfo,
    packageInfo,
    packageSettings,
  };
}

export function getLocFromRange(
  context: GenericContext,
  range: TSESTree.Node['range']
): TSESTree.Node['loc'] {
  const start = context.sourceCode.getLocFromIndex(range[0]);
  const end = context.sourceCode.getLocFromIndex(range[1]);
  return { start, end };
}

const fileWatchingInitialized = new Set<string>();
// This code is too dynamic w.r.t. the filesystem to effectively test
/* istanbul ignore next */
async function initializeFileWatching(
  repoSettings: ParsedRepoSettings,
  packageSettings: ParsedPackageSettings
) {
  if (fileWatchingInitialized.has(packageSettings.packageRootDir)) {
    return;
  }
  fileWatchingInitialized.add(packageSettings.packageRootDir);

  async function getUpdatedAtTimes() {
    const packageInfo = getPackageInfo(packageSettings.packageRootDir);
    const { files, packageJsons } = await getFiles(
      packageInfo.packageRootDir,
      packageSettings.ignorePatterns,
      packageSettings.ignoreOverridePatterns,
      packageSettings.defaultIgnoreOverrides
    );
    return {
      files: new Map(
        files.map(({ filePath, latestUpdatedAt }) => [
          filePath,
          latestUpdatedAt,
        ])
      ),
      packageJsons,
    };
  }

  let updatedAtTimes = await getUpdatedAtTimes();

  async function refresh() {
    try {
      // Reset settings in case package.json, tsconfig.json, eslint.config.js,
      // or other files that control users settings have changed
      markSettingsForRefresh(packageSettings.packageRootDir);
      const start = performance.now();
      const latestUpdatedTimes = await getUpdatedAtTimes();

      // First, find files that were deleted, represented by entries that are in
      // the previous list of modified times but are not in the new list
      const deleted: string[] = [];
      for (const [filePath] of updatedAtTimes.files) {
        if (!latestUpdatedTimes.files.has(filePath)) {
          deleted.push(filePath);
        }
      }

      // Now, find files that were added, represented by entries that are in
      // the new list of modified times but are not in the previous list
      const added: Array<{
        filePath: string;
        latestUpdatedAt: number;
      }> = [];
      for (const [filePath, latestUpdatedAt] of latestUpdatedTimes.files) {
        if (!updatedAtTimes.files.has(filePath)) {
          added.push({ filePath, latestUpdatedAt });
        }
      }

      // Finally, find files that were modified, represented by entries that are
      // in both the previous and new list of modified times but have different
      // last modified at times
      const modified: Array<{
        filePath: string;
        latestUpdatedAt: number;
      }> = [];
      for (const [filePath, latestUpdatedAt] of latestUpdatedTimes.files) {
        if (
          updatedAtTimes.files.has(filePath) &&
          updatedAtTimes.files.get(filePath) !== latestUpdatedAt
        ) {
          modified.push({ filePath, latestUpdatedAt });
        }
      }

      // Update the cache
      if (
        updateCacheFromFileSystem({
          repoRootDir: packageSettings.repoRootDir,
          packageRootDir: packageSettings.packageRootDir,
          changes: {
            added,
            deleted,
            modified,
          },
          packageJsons: latestUpdatedTimes.packageJsons,
          packageSettings,
          operationStart: start,
        })
      ) {
        for (const updateListener of updateListeners) {
          updateListener(packageSettings.packageRootDir);
        }
      }

      // Set up for the next refresh
      updatedAtTimes = latestUpdatedTimes;
    } finally {
      setTimeout(() => void refresh(), repoSettings.editorUpdateRate);
    }
  }

  setTimeout(() => void refresh(), repoSettings.editorUpdateRate);
}

const DEFAULT_TEST_FILE_PATTERNS = [
  '.test.',
  '.spec',
  '__test__',
  '__tests__',
  '__fixture__',
  '/test/',
  '/tests/',
];
export function isNonTestFile(filePath: string) {
  const packageSettings = getPackageCacheEntryForFile(filePath);
  if (!packageSettings) {
    exitWithInternalError('package settings are unexpectedly undefined');
  }
  // We want to ignore folders named __test__ outside of this package, in case
  // the entire package is itself a test (e.g. the unit tests for import-integrity)
  // We add a leading slash to cover test patterns that start with a slash,
  // such as the built-in '/test/' and '/tests/' patterns
  const relativeFilePath =
    '/' +
    convertToUnixishPath(
      getRelativePathFromRoot(packageSettings.packageRootDir, filePath)
    );
  for (const pattern of [
    ...DEFAULT_TEST_FILE_PATTERNS,
    ...packageSettings.testFilePatterns,
  ]) {
    if (relativeFilePath.includes(pattern)) {
      return false;
    }
  }
  return true;
}
