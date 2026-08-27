import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import {
  _testOnlyResetFiles,
  convertToUnixishPath,
  getFiles,
  getRawMonorepoPackageSettings,
  getRelativePathFromRoot,
  isDefaultIgnoredPath,
  splitPathIntoSegments,
  trimTrailingPathSeparator,
} from '../files.js';

const TEST_PACKAGE_DIR = join(import.meta.dirname, 'project');
const ROOT_DIR = resolve(join(import.meta.dirname, '..', '..', '..'));

// Each major monorepo fixture across the test suite intentionally uses a
// different package-manager marker so @manypkg's detection paths all get
// exercised somewhere:
//   - util/.../monorepoDiscovery, monorepoConflict,
//     no-unresolved-imports/.../project: npm (package-lock.json + workspaces)
//   - module/.../cache/project/monorepo: pnpm (pnpm-workspace.yaml)
//   - module/.../packageInfo/repo/project/monorepo: yarn (yarn.lock + workspaces)
//   - rules/no-unused-package-exports/.../project: lerna (lerna.json)
// The marker files are load-bearing for detection — keep them in place even
// when they look empty.
beforeEach(() => {
  _testOnlyResetFiles();
});

it('Fetches files asynchronously, respecting ignorePatterns', async () => {
  const files = await getFiles(
    join(TEST_PACKAGE_DIR, 'src'),
    [{ dir: join(TEST_PACKAGE_DIR, 'src'), contents: 'src/c.ts' }],
    []
  );
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  expect(files.files.map(({ latestUpdatedAt, ...rest }) => rest)).toEqual([
    {
      filePath: join(TEST_PACKAGE_DIR, 'src/a.ts'),
    },
    {
      filePath: join(TEST_PACKAGE_DIR, 'src/b.ts'),
    },
  ]);

  // .ignored.ts is not included in this list, which means this expect also
  // verifies that .ignored.ts is filtered out
  expect(files.packageJsons).toEqual([
    join(TEST_PACKAGE_DIR, 'package.json'),
    join(ROOT_DIR, 'package.json'),
  ]);
});

it('ignoreOverridePatterns overrides .gitignore patterns', async () => {
  // The test package's .gitignore contains 'src/c.ts', so c.ts is ignored by default.
  // First verify that without override, src/c.ts is ignored
  const filesWithoutOverride = await getFiles(
    join(TEST_PACKAGE_DIR, 'src'),
    [{ dir: join(TEST_PACKAGE_DIR, 'src'), contents: 'src/c.ts' }],
    []
  );
  expect(
    filesWithoutOverride.files.map(({ filePath }) => filePath)
  ).not.toContain(join(TEST_PACKAGE_DIR, 'src/c.ts'));

  // Reset to clear the cached ignore data
  _testOnlyResetFiles();

  // Now verify that ignoreOverridePatterns brings back the ignored file.
  // The override pattern 'src/c.ts' is relative to TEST_PACKAGE_DIR (the package root)
  // to match the .gitignore pattern structure
  const filesWithOverride = await getFiles(
    join(TEST_PACKAGE_DIR, 'src'),
    [{ dir: join(TEST_PACKAGE_DIR, 'src'), contents: 'src/c.ts' }],
    [{ dir: TEST_PACKAGE_DIR, contents: 'src/c.ts' }]
  );
  expect(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    filesWithOverride.files.map(({ latestUpdatedAt, ...rest }) => rest)
  ).toEqual([
    {
      filePath: join(TEST_PACKAGE_DIR, 'src/a.ts'),
    },
    {
      filePath: join(TEST_PACKAGE_DIR, 'src/b.ts'),
    },
    {
      filePath: join(TEST_PACKAGE_DIR, 'src/c.ts'),
    },
  ]);
});

it('ignoreOverridePatterns works with glob patterns', async () => {
  // Verify that a glob pattern in ignoreOverridePatterns works.
  // The .gitignore pattern 'src/c.ts' is overridden by 'src/*.ts' glob
  const files = await getFiles(
    join(TEST_PACKAGE_DIR, 'src'),
    [{ dir: join(TEST_PACKAGE_DIR, 'src'), contents: 'src/c.ts' }],
    [{ dir: TEST_PACKAGE_DIR, contents: 'src/*.ts' }]
  );
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  expect(files.files.map(({ latestUpdatedAt, ...rest }) => rest)).toEqual([
    {
      filePath: join(TEST_PACKAGE_DIR, 'src/a.ts'),
    },
    {
      filePath: join(TEST_PACKAGE_DIR, 'src/b.ts'),
    },
    {
      filePath: join(TEST_PACKAGE_DIR, 'src/c.ts'),
    },
  ]);
});

it('Ignores default directories and dot directories, except .worktrees', () => {
  // Ordinary paths are analyzed
  expect(
    isDefaultIgnoredPath(join('/home/me/projects/my-repo/src/bar.js'))
  ).toBe(false);

  // Dot directories inside the package are ignored
  expect(
    isDefaultIgnoredPath(join('/home/me/my-repo/src/.generated/bar.js'))
  ).toBe(true);

  // .worktrees is exempted, whether it's an ancestor of the checkout or
  // inside the repo (see https://github.com/nebrius/import-integrity-lint/issues/46)
  expect(
    isDefaultIgnoredPath(join('/home/me/.worktrees/my-repo/src/bar.js'))
  ).toBe(false);
  expect(
    isDefaultIgnoredPath(join('/home/me/my-repo/.worktrees/feat-1/src/bar.js'))
  ).toBe(false);

  // Other dot directories are still ignored, even as ancestors
  expect(
    isDefaultIgnoredPath(join('/home/me/.checkouts/my-repo/src/bar.js'))
  ).toBe(true);

  // Default ignore directories are ignored, including inside a .worktrees path
  expect(isDefaultIgnoredPath(join('/home/me/my-repo/node_modules/foo'))).toBe(
    true
  );
  expect(isDefaultIgnoredPath(join('/home/me/my-repo/dist/bar.js'))).toBe(true);
  expect(isDefaultIgnoredPath(join('/home/me/my-repo/build/bar.js'))).toBe(
    true
  );
  expect(isDefaultIgnoredPath(join('/home/me/my-repo/out/bar.js'))).toBe(true);
  expect(
    isDefaultIgnoredPath(
      join('/home/me/.worktrees/feat-1/node_modules/foo/bar.js')
    )
  ).toBe(true);
});

it('Can split paths into segments', () => {
  expect(splitPathIntoSegments('a/b/c')).toEqual(['a', 'b', 'c']);
  expect(splitPathIntoSegments('C:\\a\\b\\c')).toEqual(['a', 'b', 'c']);
  expect(() => {
    splitPathIntoSegments('a/b\\c');
  }).toThrow('contains both / and \\');
});

it('Can convert to unixish path', () => {
  expect(convertToUnixishPath('a/b/c')).toEqual('a/b/c');
  expect(convertToUnixishPath('/a/b/c')).toEqual('/a/b/c');
  expect(convertToUnixishPath('a\\b\\c')).toEqual('a/b/c');
  expect(convertToUnixishPath('C:\\a\\b\\c')).toEqual('/a/b/c');
});

it('Can trim trailing path separators', () => {
  expect(trimTrailingPathSeparator('a/b/c')).toEqual('a/b/c');
  expect(trimTrailingPathSeparator('a/b/c/')).toEqual('a/b/c');
  expect(trimTrailingPathSeparator('C:\\a\\b\\c')).toEqual('C:\\a\\b\\c');
  expect(trimTrailingPathSeparator('C:\\a\\b\\c\\')).toEqual('C:\\a\\b\\c');
});

it('Can get relative path to root', () => {
  expect(getRelativePathFromRoot(`/base`, '/base/src/a.ts')).toEqual(
    'src/a.ts'
  );
  expect(getRelativePathFromRoot(`/base`, '/base')).toEqual('');
  expect(getRelativePathFromRoot(`/base`, '/src/a.ts')).toEqual('src/a.ts');
  expect(getRelativePathFromRoot(`/base`, 'src/a.ts')).toEqual('src/a.ts');
});

it('Returns one entry per workspace package and reads each package config file', () => {
  const fixtureDir = join(TEST_PACKAGE_DIR, 'monorepoDiscovery');
  const result = getRawMonorepoPackageSettings(fixtureDir);

  // Sorted by directory per @manypkg's expandPackageGlobsSync.
  expect(result).toHaveLength(3);
  expect(result.map((r) => r.packageRootDir)).toEqual([
    join(fixtureDir, 'packages', 'noConfig'),
    join(fixtureDir, 'packages', 'withJson'),
    join(fixtureDir, 'packages', 'withJsonc'),
  ]);

  // Packages without a import-integrity config get the empty-object default.
  const noConfig = result.find((r) => r.packageRootDir.endsWith('noConfig'));
  expect(noConfig?.configFileContents).toBe('{}');

  // .json contents are returned verbatim.
  const withJson = result.find((r) => r.packageRootDir.endsWith('withJson'));
  expect(withJson?.configFileContents).toBe(
    readFileSync(
      join(fixtureDir, 'packages', 'withJson', 'import-integrity.config.json'),
      'utf-8'
    )
  );

  // .jsonc contents are returned verbatim — caller is responsible for parsing
  // jsonc, this function only reads the bytes.
  const withJsonc = result.find((r) => r.packageRootDir.endsWith('withJsonc'));
  expect(withJsonc?.configFileContents).toBe(
    readFileSync(
      join(
        fixtureDir,
        'packages',
        'withJsonc',
        'import-integrity.config.jsonc'
      ),
      'utf-8'
    )
  );
});

it('Ignores import-integrity config files outside declared workspace globs', () => {
  const fixtureDir = join(TEST_PACKAGE_DIR, 'monorepoDiscovery');
  const result = getRawMonorepoPackageSettings(fixtureDir);

  expect(result.map((r) => r.packageRootDir)).not.toContain(
    join(fixtureDir, 'notWorkspace')
  );
});

it('Throws when both import-integrity.config.json and .jsonc exist in the same package', () => {
  const fixtureDir = join(TEST_PACKAGE_DIR, 'monorepoConflict');
  expect(() => getRawMonorepoPackageSettings(fixtureDir)).toThrow(
    `Multiple import-integrity.config.json(c) files found in ${join(fixtureDir, 'packages', 'conflict')}`
  );
});

it('Returns the root as a single package when the root has no workspaces config', () => {
  const fixtureDir = join(TEST_PACKAGE_DIR, 'singlePackageRoot');
  const result = getRawMonorepoPackageSettings(fixtureDir);

  expect(result).toHaveLength(1);
  expect(result[0].packageRootDir).toBe(fixtureDir);
  expect(result[0].configFileContents).toBe(
    readFileSync(join(fixtureDir, 'import-integrity.config.json'), 'utf-8')
  );
});
