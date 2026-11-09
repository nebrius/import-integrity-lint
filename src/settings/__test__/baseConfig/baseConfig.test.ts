import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, sep } from 'node:path';

import { jest } from '@jest/globals';

import { isNonTestFile } from '../../../rules/util.js';
import { getAllPackageSettings, getRepoSettings } from '../../settings.js';

const PROJECT_DIR = join(import.meta.dirname, 'project');

// A bun workspace, linted one package at a time with packageRootDir
const BUN_DIR = join(PROJECT_DIR, 'singlerepo');
const BUN_APP_DIR = join(BUN_DIR, 'packages', 'app');
const BUN_LIB_DIR = join(BUN_DIR, 'packages', 'lib');

// A rush monorepo, linted from the root with monorepoRootDir
const RUSH_DIR = join(PROJECT_DIR, 'monorepo');
const RUSH_ONE_DIR = join(RUSH_DIR, 'packages', 'one');
const RUSH_TWO_DIR = join(RUSH_DIR, 'packages', 'two');

const PLAIN_DIR = join(PROJECT_DIR, 'plain');
const INVALID_BASE_DIR = join(PROJECT_DIR, 'invalidBase');

function getSinglePackageSettings(
  packageRootDir: string,
  extraSettings: Record<string, unknown> = {}
) {
  const { packageSettings } = getAllPackageSettings({
    filename: join(packageRootDir, 'src', 'a.ts'),
    settings: {
      'import-integrity': {
        mode: 'one-shot',
        packageRootDir,
        ...extraSettings,
      },
    },
  });
  if (!packageSettings) {
    throw new Error('packageSettings should be defined');
  }
  return packageSettings;
}

it('Applies the workspace base config under a package config file in single-package mode', () => {
  const settings = getSinglePackageSettings(BUN_APP_DIR);

  // The package's own alias replaces the base's alias wholesale
  expect(settings.wildcardAliases).toEqual({
    '@app/': join(BUN_APP_DIR, 'lib' + sep),
  });

  // Keys the package doesn't set come from the base, with paths bound to the
  // package
  expect(settings.ignorePatterns).toEqual([
    { dir: BUN_APP_DIR, contents: 'generated/**' },
  ]);
  expect(settings.testFilePatterns).toEqual(['__base_test__']);
  expect(isNonTestFile(join(BUN_APP_DIR, 'src', 'a.__base_test__.ts'))).toBe(
    false
  );
  expect(isNonTestFile(join(BUN_APP_DIR, 'src', 'a.ts'))).toBe(true);
});

it('Applies the workspace base config to a package without a config file', () => {
  const settings = getSinglePackageSettings(BUN_LIB_DIR);

  expect(settings.wildcardAliases).toEqual({
    '@base/': join(BUN_LIB_DIR, 'src' + sep),
  });
  expect(settings.ignorePatterns).toEqual([
    { dir: BUN_LIB_DIR, contents: 'generated/**' },
  ]);
  expect(settings.testFilePatterns).toEqual(['__base_test__']);
});

it('Applies the workspace base config under package settings in the ESLint config', () => {
  const settings = getSinglePackageSettings(BUN_LIB_DIR, {
    testFilePatterns: ['__eslint_test__'],
  });

  expect(settings.testFilePatterns).toEqual(['__eslint_test__']);
  expect(settings.ignorePatterns).toEqual([
    { dir: BUN_LIB_DIR, contents: 'generated/**' },
  ]);
});

it('Applies the base config at the monorepo root to every package in monorepo mode', () => {
  const context = {
    filename: join(RUSH_ONE_DIR, 'a.ts'),
    settings: {
      'import-integrity': { monorepoRootDir: RUSH_DIR, mode: 'one-shot' },
    },
  };
  getRepoSettings(context);

  const { allPackageSettings } = getAllPackageSettings(context);
  const one = allPackageSettings.find((s) => s.packageRootDir === RUSH_ONE_DIR);
  const two = allPackageSettings.find((s) => s.packageRootDir === RUSH_TWO_DIR);
  if (!one || !two) {
    throw new Error('Both rush packages should be discovered');
  }

  expect(one.testFilePatterns).toEqual(['__one_test__']);
  expect(one.ignorePatterns).toEqual([
    { dir: RUSH_ONE_DIR, contents: 'tmp/**' },
  ]);
  expect(two.testFilePatterns).toEqual(['__rush_test__']);
  expect(two.ignorePatterns).toEqual([
    { dir: RUSH_TWO_DIR, contents: 'tmp/**' },
  ]);
});

// Outside a workspace there is nothing to share settings across, so a base
// config there would only duplicate the package's own config
it("Doesn't apply a base config beside a package that is not in a workspace", () => {
  const settings = getSinglePackageSettings(PLAIN_DIR);
  expect(settings.testFilePatterns).toEqual([]);
});

it('Warns and continues without a base config when the workspace root lookup fails', () => {
  // A malformed package.json beside a lockfile, which @manypkg's npm detection
  // reads and fails to parse. It's built in a temporary directory so the repo's
  // own lint never reads it
  const workspaceDir = mkdtempSync(join(tmpdir(), 'import-integrity-test-'));
  const packageDir = join(workspaceDir, 'packages', 'app');
  const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
  try {
    writeFileSync(join(workspaceDir, 'package.json'), '{ broken');
    writeFileSync(join(workspaceDir, 'package-lock.json'), '{}');
    mkdirSync(packageDir, { recursive: true });
    writeFileSync(join(packageDir, 'package.json'), '{ "name": "app" }');

    const settings = getSinglePackageSettings(packageDir, {
      testFilePatterns: ['__own_test__'],
    });
    expect(settings.testFilePatterns).toEqual(['__own_test__']);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining(
        `Could not find the workspace root of package ${packageDir} while looking for import-integrity.base.json(c), so no base config is applied`
      )
    );
  } finally {
    warnSpy.mockRestore();
    rmSync(workspaceDir, { recursive: true, force: true });
  }
});

it('Names the base config file when it contains invalid settings', () => {
  expect(() => getSinglePackageSettings(INVALID_BASE_DIR)).toThrow(
    `Invalid settings in ${join(INVALID_BASE_DIR, 'import-integrity.base.json')}:`
  );
});
