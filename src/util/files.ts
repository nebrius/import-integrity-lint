import type { Stats } from 'node:fs';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { readdir, stat } from 'node:fs/promises';
import { basename, dirname, join, relative, sep } from 'node:path';

import { getPackagesSync } from '@manypkg/get-packages';
import type { Ignore } from 'ignore';
import ignore from 'ignore';

import type { IgnorePattern } from '../settings/settings.js';
import { exitWithError, exitWithInternalError } from './error.js';
import { debug, warn } from './logging.js';

type PotentialFile = {
  filePath: string;
  stats: Stats;
};

// Remember to update the docs when changing this list (see
// docs/configuration/repo-level-options.md and package-level-options.md)
const DEFAULT_IGNORE_DIRECTORIES = ['node_modules', 'dist', 'build', 'out'];

// Check if a single path component (a folder name or file basename) is ignored
// by default: any name that starts with a dot (e.g. .git, .next) or is in
// DEFAULT_IGNORE_DIRECTORIES, unless it's explicitly overridden
function isDefaultIgnoredSegment(
  segment: string,
  defaultIgnoreOverrides: string[]
) {
  return (
    !defaultIgnoreOverrides.includes(segment) &&
    (segment.startsWith('.') || DEFAULT_IGNORE_DIRECTORIES.includes(segment))
  );
}

// Check if a path should be ignored by default because any of its segments is
// a dot-prefixed name or one of DEFAULT_IGNORE_DIRECTORIES and is not exempted
// via defaultIgnoreOverrides
export function isDefaultIgnoredPath(
  path: string,
  defaultIgnoreOverrides: string[]
) {
  return path
    .split(sep)
    .some((segment) =>
      isDefaultIgnoredSegment(segment, defaultIgnoreOverrides)
    );
}

// Look for a single import-integrity.config.json(c) file directly inside dir.
// Returns the absolute path if exactly one is present, undefined if none, and
// throws if both filename variants exist in the same directory.
export function findPackageConfigFile(dir: string): string | undefined {
  const directoryContents = readdirSync(dir, { withFileTypes: true });
  const configFiles = directoryContents.filter(
    (item) =>
      item.name === 'import-integrity.config.json' ||
      item.name === 'import-integrity.config.jsonc'
  );
  if (configFiles.length === 0) {
    return undefined;
  }
  if (configFiles.length > 1) {
    exitWithError(
      `Multiple import-integrity.config.json(c) files found in ${dir}`
    );
  }
  return join(dir, configFiles[0].name);
}

// Fetch a list of all import-integrity.config.json files, which correspond to each
// package that we want to analyze in a monorepo. We use our own recursive
// implementation instead of a library like glob to avoid recusring into folders
// that are a) very large and b) guaranteed to not be analyzed.
export function getRawMonorepoPackageSettings(repoRootDir: string) {
  const rawPackageSettings: {
    packageRootDir: string;
    configFileContents: string;
  }[] = [];

  const packageDirs = getPackagesSync(repoRootDir).packages;
  debug('Packages to analyze:');
  for (const packageDir of packageDirs) {
    debug(`  ${relative(repoRootDir, packageDir.dir)}`);
    const configFile = findPackageConfigFile(packageDir.dir);
    rawPackageSettings.push({
      packageRootDir: packageDir.dir,
      configFileContents: configFile ? readFileSync(configFile, 'utf-8') : '{}',
    });
  }

  return rawPackageSettings;
}

export function getFilesSync(
  packageRootDir: string,
  ignorePatterns: IgnorePattern[],
  ignoreOverridePatterns: IgnorePattern[],
  defaultIgnoreOverrides: string[]
) {
  // Read in the files and their stats, and filter out directories
  const potentialFiles = getPotentialFilesList(
    packageRootDir,
    defaultIgnoreOverrides
  )
    // Stats will be used for multiple checks later, so we want to cache it now.
    // Unfortunately we need more than what {withFileTypes: true} provides, so
    // we still need to call statSync separately
    .map((filePath) => ({ filePath, stats: statSync(filePath) }))

    // Filter out any directories, so that this is only a file list
    .filter((f) => !f.stats.isDirectory());

  // Find all package.json files between packageRootDir and the file system root, since
  // Node.js will always look this far for dependencies
  const parentPackageJsons: string[] = [];
  let currentDir = packageRootDir;
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  while (true) {
    const dirContents = readdirSync(currentDir);
    if (dirContents.includes('package.json')) {
      parentPackageJsons.push(join(currentDir, 'package.json'));
    }
    const nextDir = dirname(currentDir);
    if (nextDir === currentDir) {
      break;
    }
    currentDir = nextDir;
  }

  // Return the list of files
  return buildFileList(
    packageRootDir,
    parentPackageJsons,
    ignorePatterns,
    ignoreOverridePatterns,
    // Nested .gitignore files are collected from the unfiltered list, since
    // the default-ignore filter below always removes them (their basename
    // starts with a dot)
    potentialFiles
      .filter(({ filePath }) => basename(filePath) === '.gitignore')
      .map(({ filePath }) => filePath),
    potentialFiles.filter(
      ({ filePath }) => !isDefaultIgnoredPath(filePath, defaultIgnoreOverrides)
    )
  );
}

export async function getFiles(
  packageRootDir: string,
  ignorePatterns: IgnorePattern[],
  ignoreOverridePatterns: IgnorePattern[],
  defaultIgnoreOverrides: string[]
) {
  // First, read in the files and convert the results to absolute path
  const potentialFilePaths = getPotentialFilesList(
    packageRootDir,
    defaultIgnoreOverrides
  );

  // Now add the stats to each file
  const potentialFiles = (
    await Promise.all(
      potentialFilePaths.map(async (filePath) => {
        const stats = await stat(filePath);
        return { filePath, stats };
      })
    )
  )
    // Filter out any directories, so that this is only a file list
    .filter((f) => !f.stats.isDirectory());

  const parentPackageJsons: string[] = [];
  let currentDir = packageRootDir;
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  while (true) {
    const dirContents = await readdir(currentDir);
    if (dirContents.includes('package.json')) {
      parentPackageJsons.push(join(currentDir, 'package.json'));
    }
    const nextDir = dirname(currentDir);
    if (nextDir === currentDir) {
      break;
    }
    currentDir = nextDir;
  }

  // Return the list of files
  return buildFileList(
    packageRootDir,
    parentPackageJsons,
    ignorePatterns,
    ignoreOverridePatterns,
    // Nested .gitignore files are collected from the unfiltered list, since
    // the default-ignore filter below always removes them (their basename
    // starts with a dot)
    potentialFiles
      .filter(({ filePath }) => basename(filePath) === '.gitignore')
      .map(({ filePath }) => filePath),
    potentialFiles.filter(
      ({ filePath }) => !isDefaultIgnoredPath(filePath, defaultIgnoreOverrides)
    )
  );
}

const WINDOWS_ABSOLUTE_PATH_REGEX = /^[A-Z]:\\/;
export function convertToUnixishPath(path: string) {
  if (path.includes('/') && path.includes('\\')) {
    exitWithInternalError(`Path ${path} contains both / and \\`);
  }
  if (WINDOWS_ABSOLUTE_PATH_REGEX.test(path)) {
    path = path.substring(2);
  }
  if (path.includes('\\')) {
    return path.replaceAll('\\', '/');
  }
  return path;
}

export function trimTrailingPathSeparator(path: string) {
  if (path.endsWith('/')) {
    return path.slice(0, -1);
  } else if (path.endsWith('\\')) {
    return path.slice(0, -1);
  }
  return path;
}

export function splitPathIntoSegments(path: string) {
  return convertToUnixishPath(path)
    .split('/')
    .filter((s) => s);
}

export function getRelativePathFromRoot(
  packageRootDir: string,
  filePath: string
) {
  const relativePath = filePath.replace(packageRootDir, '');
  if (relativePath.startsWith('/') || relativePath.startsWith('\\')) {
    return relativePath.substring(1);
  }
  return relativePath;
}

type IgnoreData = {
  cache: Map<string, boolean>;
  ignores: Array<{ dir: string; ig: Ignore }>;
  overrides: Array<{ dir: string; ig: Ignore }>;
};

// Map from packageRootDir to ignore data
const ignoreData = new Map<string, IgnoreData>();
export function isFileIgnored(packageRootDir: string, filePath: string) {
  const data = ignoreData.get(packageRootDir);
  if (!data) {
    return true;
  }

  // Get the file from the cache, if it's already cached
  const fileCacheResult = data.cache.get(filePath);
  if (typeof fileCacheResult === 'boolean') {
    return fileCacheResult;
  }

  // Check override patterns first - if matched, file is NOT ignored
  for (const { dir, ig } of data.overrides) {
    if (filePath.startsWith(dir) && ig.ignores(relative(dir, filePath))) {
      data.cache.set(filePath, false);
      return false;
    }
  }

  // Check ignore patterns
  for (const { dir, ig } of data.ignores) {
    // Ignore file paths are relative to the directory the ignore file is in,
    // and needs files passed in to check to also be relative to that same
    // directory, so we get the relative path to the ignore file directory
    if (filePath.startsWith(dir) && ig.ignores(relative(dir, filePath))) {
      data.cache.set(filePath, true);
      return true;
    }
  }
  data.cache.set(filePath, false);
  return false;
}

export function _testOnlyResetFiles() {
  ignoreData.clear();
}

export function getDependenciesFromPackageJson(packageJsonPath: string) {
  let packageJsonContents: string;

  // If a package.json file gets moved in just the right order, we sometimes
  // get a race condition where the file is missing due to the move. As such
  // we catch the error and return an empty array.
  try {
    packageJsonContents = readFileSync(packageJsonPath, 'utf-8');
  } catch {
    return [];
  }

  // If the package.json file is invalid JSON, we can't parse it but still need
  // to recover gracefully
  let parsedPackageJson: {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
    peerDependencies?: Record<string, string>;
    workspaces?: string[];
  };
  try {
    parsedPackageJson = JSON.parse(packageJsonContents) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
      peerDependencies?: Record<string, string>;
      workspaces?: string[];
    };
  } catch (e) {
    warn(
      `Failed to parse ${packageJsonPath}: ${e instanceof Error ? e.message : String(e)}`
    );
    return [];
  }

  const dependencies: string[] = [];
  if (parsedPackageJson.dependencies) {
    dependencies.push(...Object.keys(parsedPackageJson.dependencies));
  }
  if (parsedPackageJson.devDependencies) {
    dependencies.push(...Object.keys(parsedPackageJson.devDependencies));
  }
  if (parsedPackageJson.peerDependencies) {
    dependencies.push(...Object.keys(parsedPackageJson.peerDependencies));
  }

  return dependencies;
}

// Get a potential list of files, skipping directories that are ignored by
// default (see isDefaultIgnoredSegment) during traversal, since some of them
// contain lots of files and we always want to ignore them early on for perf
// reasons. Waiting to check against ignores incurs a big perf hit due to the
// more complex and Regex based logic of ignores.
function getPotentialFilesList(
  packageRootDir: string,
  defaultIgnoreOverrides: string[]
): string[] {
  const potentialFilesList: string[] = [];

  const dirContents = readdirSync(packageRootDir, {
    withFileTypes: true,
  });

  for (const content of dirContents) {
    if (!content.isDirectory()) {
      potentialFilesList.push(join(packageRootDir, content.name));
    } else if (!isDefaultIgnoredSegment(content.name, defaultIgnoreOverrides)) {
      potentialFilesList.push(
        ...getPotentialFilesList(
          join(packageRootDir, content.name),
          defaultIgnoreOverrides
        )
      );
    }
  }

  return potentialFilesList;
}

function buildFileList(
  packageRootDir: string,
  parentPackageJsons: string[],
  ignorePatterns: IgnorePattern[],
  ignoreOverridePatterns: IgnorePattern[],
  nestedGitignoreFiles: string[],
  potentialFiles: PotentialFile[]
) {
  // Create the ignore instances for use in filtering
  initializeIgnores(
    packageRootDir,
    ignorePatterns,
    ignoreOverridePatterns,
    nestedGitignoreFiles
  );

  // Filter out ignored files
  const files: Array<{
    filePath: string;
    latestUpdatedAt: number;
  }> = [];
  const packageJsons: string[] = [...parentPackageJsons];
  for (const { filePath, stats } of potentialFiles) {
    if (basename(filePath) === 'package.json') {
      packageJsons.push(filePath);
    }
    if (isFileIgnored(packageRootDir, filePath)) {
      continue;
    }
    files.push({
      filePath,
      latestUpdatedAt: stats.mtimeMs,
    });
  }

  return { files, packageJsons };
}

function initializeIgnores(
  packageRootDir: string,
  ignorePatterns: IgnorePattern[],
  ignoreOverridePatterns: IgnorePattern[],
  nestedGitignoreFiles: string[]
) {
  if (ignoreData.has(packageRootDir)) {
    return;
  }

  // First, we need to traverse up the folder tree until we find the git root
  // folder. We're often operating in a package where `packageRootDir` is a `src`
  // folder, or even in a monorepo. In these cases, there is likely a gitignore
  // file(s) futher up the tree
  const extraIgnoreFiles: string[] = [];
  let currentDir = packageRootDir;
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  while (true) {
    const currentDirContents = readdirSync(currentDir);
    if (currentDirContents.includes('.gitignore')) {
      extraIgnoreFiles.push(join(currentDir, '.gitignore'));
    }
    // If we found the git root folder, bail
    if (currentDirContents.includes('.git')) {
      break;
    }
    const nextDir = dirname(currentDir);
    // If we're at the root folder of the file system, bail. Note: we do the
    // check this way to support both UNIX and Windows filesystems
    if (nextDir === currentDir) {
      break;
    }
    currentDir = nextDir;
  }

  // Normalize and read in all ignore file contents. The walk-up and the
  // traversal both find packageRootDir's own .gitignore, so deduplicate
  const ignoreFiles = Array.from(
    new Set([...extraIgnoreFiles, ...nestedGitignoreFiles])
  ).map((filePath) => ({
    filePath,
    contents: readFileSync(filePath, 'utf-8'),
  }));

  ignoreData.set(packageRootDir, {
    ignores: [
      ...ignorePatterns.map((i) => ({
        dir: i.dir,
        ig: ignore().add(i.contents),
      })),
      ...ignoreFiles.map((i) => ({
        dir: dirname(i.filePath),
        ig: ignore().add(i.contents),
      })),
    ],
    overrides: ignoreOverridePatterns.map((i) => ({
      dir: i.dir,
      ig: ignore().add(i.contents),
    })),
    cache: new Map<string, boolean>(),
  });
}
