import { existsSync } from 'node:fs';
import { isAbsolute, join, resolve } from 'node:path';

import type { Ignore } from 'ignore';
import ignore from 'ignore';

import type { GenericContext } from '../types/context.js';
import { exitWithError, exitWithInternalError } from '../util/error.js';
import {
  getRawMonorepoPackageSettings,
  trimTrailingPathSeparator,
} from '../util/files.js';
import { getSubpathEntry } from '../util/getSubpathEntry.js';
import { debug, warn } from '../util/logging.js';
import { getInferredFrameworkImportedFiles } from './framework.js';
import { getPackageJsonSettings } from './package.js';
import { getTypeScriptSettings } from './typescript.js';
import type { PackageSettings, RepoUserSettings } from './user.js';
import {
  getUserPackageSettingsFromConfigFile,
  getUserRepoSettings,
} from './user.js';

export type IgnorePattern = {
  dir: string;
  contents: string;
};

export type ParsedPackageSettings = Omit<
  PackageSettings,
  | 'ignorePatterns'
  | 'ignoreOverridePatterns'
  | 'wildcardAliases'
  | 'fixedAliases'
  | 'entryPoints'
  | 'testFilePatterns'
> & {
  ignorePatterns: IgnorePattern[];
  ignoreOverridePatterns: IgnorePattern[];
  wildcardAliases: Record<string, string>;
  fixedAliases: Record<string, string>;
  entryPoints: Array<
    | { type: 'dynamic'; subPathPattern: string; filePattern: RegExp }
    | { type: 'static'; subPath: string; filePath: string }
  >;
  externallyImported: Array<{ file: Ignore }>;
  testFilePatterns: string[];
  packageName: string | undefined;
};

export type ParsedRepoSettings = Exclude<RepoUserSettings, 'mode'> & {
  mode: 'editor' | 'fix' | 'one-shot';
  editorUpdateRate: number;
};

// Honestly the process.argv stuff isn't worth the effort to test, since it
// involves mocking process.argv, which is a pain.
/* instanbul ignore next */
function argsInclude(strs: string[]) {
  for (const str of strs) {
    if (process.argv.some((arg) => arg.includes(str))) {
      return true;
    }
  }
  return false;
}
/* instanbul ignore next */
const DEFAULT_MODE =
  // For ESLint we see the original executable path and sniff for the editor
  process.argv[0].includes('Visual Studio Code') ||
  process.argv[0].includes('Cursor') ||
  process.argv[0].includes('Windsurf') ||
  process.argv[0].includes('Devin') ||
  // For Oxlint it's run in a subprocess, so we look for the lsp flag
  process.argv.includes('--lsp')
    ? 'editor'
    : argsInclude(['--fix', '--fix-dry-run', '--fix-type'])
      ? 'fix'
      : 'one-shot';

const packageSettingsCache = new Map<
  string,
  { settings: ParsedPackageSettings }
>();

const repoSettingsCache = new Map<
  string,
  { settings: ParsedRepoSettings; refresh: boolean }
>();

// Used for tests
export function _testOnlyResetAllSettings() {
  packageSettingsCache.clear();
  repoSettingsCache.clear();
}

// Used when settings files have changed in editor mode
export function markSettingsForRefresh(packageRootDir: string) {
  const packageCacheEntry = packageSettingsCache.get(packageRootDir);
  if (packageCacheEntry) {
    const repoCacheEntry = repoSettingsCache.get(
      packageCacheEntry.settings.repoRootDir
    );
    /* instanbul ignore next */
    if (!repoCacheEntry) {
      exitWithInternalError(
        'Could not get repo cache settings from package cache settings'
      );
    }
    repoSettingsCache.set(packageRootDir, {
      settings: repoCacheEntry.settings,
      refresh: true,
    });
  }
}

function compareSettingsObjects(
  a: Record<string, unknown>,
  b: Record<string, unknown> | undefined
) {
  return !!b && JSON.stringify(a) === JSON.stringify(b);
}

function escapeRegExp(str: string) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function getRepoSettings(
  context: Pick<GenericContext, 'filename' | 'settings'>
): ParsedRepoSettings {
  let cachedSettings: ParsedRepoSettings | undefined;
  let needsRefresh = false;
  const cachedRepoEntry = getRepoCacheEntryForFile(context.filename);
  if (cachedRepoEntry) {
    cachedSettings = cachedRepoEntry.settings;
    needsRefresh = cachedRepoEntry.refresh;
  }
  if (cachedSettings && !needsRefresh) {
    return cachedSettings;
  }

  const { mode: rawMode, ...rest } = getUserRepoSettings(context.settings);

  const mode =
    rawMode === 'auto' || rawMode === undefined ? DEFAULT_MODE : rawMode;
  if (cachedSettings?.mode !== mode) {
    if (cachedSettings) {
      debug(`Mode change from ${cachedSettings.mode} to ${mode}`);
    } else {
      debug(`Running in ${mode} mode`);
    }
  }

  const repoSettings: ParsedRepoSettings = {
    ...rest,
    mode,
  };
  repoSettingsCache.set(rest.repoRootDir, {
    settings: repoSettings,
    refresh: false,
  });

  // If we're in single repo mode, we need to also parse and store the
  // package settings here
  if (rest.type === 'singlerepo') {
    populatePackageSettingsCache(rest.packageSettings);
  } else {
    const packageConfigFiles = getRawMonorepoPackageSettings(rest.repoRootDir);
    for (const packageConfigFile of packageConfigFiles) {
      const packageSettings = getUserPackageSettingsFromConfigFile({
        repoRootDir: rest.repoRootDir,
        ...packageConfigFile,
      });
      populatePackageSettingsCache(packageSettings);
    }
  }

  return repoSettings;
}

// Gets all known package settings. This takes into account the current file
// being linted so that we can detect if we're in an editor and a new package
// was just added. This also refreshes the cache after invalidation.
export function getAllPackageSettings(
  context: Pick<GenericContext, 'filename' | 'settings'>
) {
  // First we check if this file has a cached entry or not
  const cachedRepoEntry = getRepoCacheEntryForFile(context.filename);
  if (cachedRepoEntry && !cachedRepoEntry.refresh) {
    // If we got here, then that means we're eligible to use the cached copy of
    // the package settings, if it exists.
    const packageSettings = getPackageCacheEntryForFile(context.filename);

    // No package settings means one of two things:
    // 1. This file is outside the scope of any known package
    // 2. This is a new package that was just added
    // We take the optimistic case that this file is outside the scope of any
    // unknown package and return undefined for the package settings, even
    // though it will occasionally be wrong. We do this because recomputing
    // the package settings is expensive, and will be recomputed once the
    // refresh flag is set anyways.
    return {
      allPackageSettings: getAllPackageCacheEntries(),
      packageSettings,
    };
  }

  // Calling this will repopulate the repo settings cache and the cache for this
  // package' settings, as well as repo settings. We don't need the return value
  // here, but we do need the side effects.
  getRepoSettings(context);

  // We're now guaranteed to have the latest package settings, since they're
  // computed as part of the repo settings computation.
  const allPackageSettings = getAllPackageCacheEntries();
  const packageSettings = getPackageCacheEntryForFile(context.filename);
  return { allPackageSettings, packageSettings };
}

function populatePackageSettingsCache(userPackageSettings: PackageSettings) {
  const { packageRootDir } = userPackageSettings;

  // Get TypeScript supplied settings
  const { mapping, ...typeScriptSettings } =
    getTypeScriptSettings(packageRootDir);

  // Get package.json settings
  const { exports: packageJsonExports, ...packageJsonSettings } =
    getPackageJsonSettings(packageRootDir);

  // Get frameworks-specific settings
  const inferredFrameworkImportedFiles =
    getInferredFrameworkImportedFiles(packageRootDir);

  // Merge TypeScript and user settings, with user settings taking precedence
  const mergedSettings = {
    ...typeScriptSettings,
    ...packageJsonSettings,
    ...userPackageSettings,
  };

  // Compute a mapping from compiled package exports to source, if possible
  const inferredEntryPoints: Record<string, string> = {};
  if (packageJsonExports) {
    for (const [key, value] of Object.entries(packageJsonExports)) {
      // If this is a TypeScript file, we know it's not mapped and can use its
      // entry directly. We have to be careful not to match `.d.ts` files though
      // since those are compiled artifacts
      if (
        (value.endsWith('.ts') ||
          value.endsWith('.mts') ||
          value.endsWith('.cts')) &&
        !(
          value.endsWith('.d.ts') ||
          value.endsWith('.d.mts') ||
          value.endsWith('.d.cts')
        )
      ) {
        inferredEntryPoints[key] = value;
      }
      // Otherwise we require a mapping from tsconfig
      else if (mapping) {
        if (!value.startsWith(mapping.outDir)) {
          warn(
            `Export ${key} in ${packageRootDir} in package.json export doesn't start with TypeScript's outDir ${mapping.outDir}`
          );
          continue;
        }
        const baseFile = value.replace(mapping.outDir, mapping.rootDir);
        // Strip an extension. Treats `.d.ts`, `.d.mts`, `.d.cts` as single
        // units so the types-only-package case (`exports: { '.': { types:
        // './dist/index.d.ts' } }`, source at `./src/index.ts`) survives the
        // dist→src rewrite. The alternation tries `.d.<ext>` first so the
        // declaration-extension family is matched before the single-extension
        // fallback.
        function stripExtension(path: string): string {
          return path.replace(/\.d\.(?:ts|mts|cts)$|\.[^/.]+$/, '');
        }
        let srcFile: string | undefined;
        if (existsSync(join(packageRootDir, baseFile))) {
          srcFile = baseFile;
        } else {
          const withoutExt = stripExtension(baseFile);
          const tsBaseFile = `${withoutExt}.ts`;
          if (existsSync(join(packageRootDir, tsBaseFile))) {
            srcFile = tsBaseFile;
          } else {
            const tsxBaseFile = `${withoutExt}.tsx`;
            if (existsSync(join(packageRootDir, tsxBaseFile))) {
              srcFile = tsxBaseFile;
            }
          }
        }

        if (srcFile) {
          inferredEntryPoints[key] = srcFile;
        }
      }
    }
  }

  const { alias = {}, externallyImportedFiles = [] } = mergedSettings;

  const entryPointFiles = {
    ...inferredEntryPoints,
    ...mergedSettings.entryPointFiles,
  };

  // Clean up any aliases
  const wildcardAliases: ParsedPackageSettings['wildcardAliases'] = {};
  const fixedAliases: ParsedPackageSettings['fixedAliases'] = {};
  for (let [symbol, path] of Object.entries(alias)) {
    // Compute the absolute version of the path if needed (TypeScript does this
    // already since it has different resolution rules)
    if (!isAbsolute(path)) {
      path = resolve(packageRootDir, path);
    }
    symbol = trimTrailingPathSeparator(symbol);

    // Filter out paths that don't resolve to files inside packageRootDir, since
    // they're either third party or doing something not supported
    if (!path.startsWith(packageRootDir)) {
      continue;
    }

    // Determine if this is a wildcard or fixed alias, and validate consistency
    if (symbol.endsWith('*')) {
      if (!path.endsWith('*')) {
        exitWithError(
          `Alias path ${path} must end with "*" when ${symbol} ends with "*"`
        );
      }
      wildcardAliases[symbol.replace(/\*$/, '')] = path.replace(/\*$/, '');
    } else {
      if (path.endsWith('*')) {
        exitWithError(
          `Alias path ${path} must not end with "*" when ${symbol} does not end with "*"`
        );
      }
      fixedAliases[symbol] = path;
    }
  }

  // Clean up any entry points
  const parsedEntryPoints: ParsedPackageSettings['entryPoints'] = [];
  for (const [subPathPattern, filePattern] of Object.entries(entryPointFiles)) {
    if (subPathPattern !== '.' && !subPathPattern.startsWith('./')) {
      exitWithError(
        `Entry point subpath pattern ${subPathPattern} must equal "." or start with "./"`
      );
    }
    if (!filePattern.startsWith('./')) {
      exitWithError(
        `Entry point file pattern ${filePattern} must start with "./"`
      );
    }
    if (subPathPattern.includes('*')) {
      // Node.js requires that subpaths only contain 1 wildcard, so this is just
      // a sanity check in practice.
      if (subPathPattern.split('*').length > 2) {
        exitWithError(
          `Entry point subpath pattern ${subPathPattern} must not contain more than one wildcard`
        );
      }
      // Technically speaking, file patterns can be repeated, but supporting
      // them is intractible, because the process is not fully reversible
      // and would require a significant rearchitect that would hurt performance
      if (filePattern.split('*').length > 2 || !filePattern.includes('*')) {
        exitWithError(
          `Entry point file pattern ${filePattern} must contain exactly one wildcard`
        );
      }
      parsedEntryPoints.push({
        type: 'dynamic',
        // Node.js only supports a single wildcard in the subpath pattern, so we
        // can split on '*' and join back on the capture group. Escape each side
        // of the split so regex metacharacters in the path (most commonly `.`
        // in directory names and file extensions, but also `()`, `+`, `$`,
        // etc.) match literally instead of being interpreted as regex syntax.
        subPathPattern,
        filePattern: new RegExp(
          `^${filePattern.split('*').map(escapeRegExp).join('(.*)')}$`
        ),
      });
    } else {
      parsedEntryPoints.push({
        type: 'static',
        subPath: subPathPattern,
        filePath: filePattern,
      });
    }
  }

  const externallyImportedFilesToUse = Array.from(
    new Set([
      // Always ignore config files in the root directory
      '/*.config.*',
      ...(inferredFrameworkImportedFiles ?? []),
      ...externallyImportedFiles,
    ])
  );
  const parsedExternallyImported: ParsedPackageSettings['externallyImported'] =
    [];
  for (const filePattern of externallyImportedFilesToUse) {
    parsedExternallyImported.push({
      file: ignore().add(filePattern),
    });
  }

  const cachedSettings = packageSettingsCache.get(packageRootDir)?.settings;
  if (cachedSettings?.packageRootDir !== packageRootDir) {
    if (cachedSettings) {
      debug(
        `Package root dir change from ${cachedSettings.packageRootDir} to ${packageRootDir}`
      );
    } else {
      debug(`Setting package root dir to ${packageRootDir}`);
    }
  }

  if (
    !compareSettingsObjects(wildcardAliases, cachedSettings?.wildcardAliases)
  ) {
    if (cachedSettings) {
      debug(`Wildcard aliases changed`);
    }
    if (!Object.keys(wildcardAliases).length) {
      debug(`No wildcard aliases defined`);
    } else {
      debug(`Wildcard aliases:`);
      for (const [symbol, path] of Object.entries(wildcardAliases)) {
        debug(`  ${symbol}: ${path}`);
      }
    }
  }

  if (!compareSettingsObjects(fixedAliases, cachedSettings?.fixedAliases)) {
    if (cachedSettings) {
      debug(`Fixed aliases changed`);
    }
    if (!Object.keys(fixedAliases).length) {
      debug(`No fixed aliases defined`);
    } else {
      debug(`Fixed aliases:`);
      for (const [symbol, path] of Object.entries(fixedAliases)) {
        debug(`  ${symbol}: ${path}`);
      }
    }
  }

  if (Object.keys(inferredEntryPoints).length > 0) {
    debug(`Inferred entry points:`);
    for (const [key, value] of Object.entries(inferredEntryPoints)) {
      debug(`  ${key} -> ${value}`);
    }
  }

  const ignorePatterns = (mergedSettings.ignorePatterns ?? []).map((p) => ({
    dir: packageRootDir,
    contents: p,
  }));

  const ignoreOverridePatterns = (
    mergedSettings.ignoreOverridePatterns ?? []
  ).map((p) => ({
    dir: packageRootDir,
    contents: p,
  }));

  // Apply defaults and save to the settings cache
  const newSettings: ParsedPackageSettings = {
    repoRootDir: mergedSettings.repoRootDir,
    packageName: packageJsonSettings.packageName,
    packageRootDir,
    wildcardAliases,
    fixedAliases,
    entryPoints: parsedEntryPoints,
    externallyImported: parsedExternallyImported,
    ignorePatterns,
    ignoreOverridePatterns,
    testFilePatterns: mergedSettings.testFilePatterns ?? [],
  };
  packageSettingsCache.set(packageRootDir, {
    settings: newSettings,
  });
}

function getRepoCacheEntryForFile(filePath: string) {
  return getSubpathEntry({
    filePath,
    data: repoSettingsCache,
  });
}

export function getPackageCacheEntryForFile(filePath: string) {
  const result = getSubpathEntry({
    filePath,
    data: packageSettingsCache,
  });
  return result?.settings;
}

function getAllPackageCacheEntries() {
  return Array.from(
    packageSettingsCache.entries().map(([, { settings }]) => settings)
  );
}
