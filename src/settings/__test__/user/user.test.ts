import { readFileSync } from 'node:fs';
import { join, sep } from 'node:path';

import type {
  ParsedPackageSettings,
  ParsedRepoSettings,
} from '../../settings.js';
import {
  getAllPackageSettings,
  getRepoSettings,
  markSettingsForRefresh,
} from '../../settings.js';
import { getUserPackageSettingsFromConfigFile } from '../../user.js';

const TEST_PACKAGE_DIR = join(import.meta.dirname, 'project');
const FILE_A = join(TEST_PACKAGE_DIR, 'src', 'a.ts');

const CONFIG_FILE_PACKAGE_DIR = join(
  import.meta.dirname,
  'project-with-config'
);
const CONFIG_FILE_FILE_A = join(CONFIG_FILE_PACKAGE_DIR, 'src', 'a.ts');

const MULTI_CONFIG_PACKAGE_DIR = join(
  import.meta.dirname,
  'project-with-multiple-configs'
);
const MULTI_CONFIG_FILE_A = join(MULTI_CONFIG_PACKAGE_DIR, 'src', 'a.ts');

const MONOREPO_DIR = join(
  import.meta.dirname,
  '../../../module/__test__/cache/project/monorepo'
);
const MONOREPO_PKG_ONE = join(MONOREPO_DIR, 'packages', 'packageOne');
const MONOREPO_PKG_TWO = join(MONOREPO_DIR, 'packages', 'packageTwo');
const MONOREPO_FILE_A = join(MONOREPO_PKG_ONE, 'a.ts');
const MONOREPO_FILE_C = join(MONOREPO_PKG_TWO, 'c.ts');

it('Fetchings user supplied settings', () => {
  const { packageSettings } = getAllPackageSettings({
    filename: FILE_A,
    settings: {
      'import-integrity': {
        mode: 'one-shot',
        packageRootDir: TEST_PACKAGE_DIR,
        alias: {
          '@/*': 'src/*',
          '@a': 'src/a.ts',
        },
        ignorePatterns: ['src/b*'],
        ignoreOverridePatterns: ['src/c*'],
        defaultIgnoreOverrides: ['.worktrees', 'dist'],
        entryPointFiles: { '.': './src/a.ts' },
        externallyImportedFiles: ['src/b.ts'],
      },
    },
  });
  if (!packageSettings) {
    throw new Error('packageSettings should be defined');
  }
  const { entryPoints, externallyImported, ...settings } = packageSettings;
  const expected: Omit<
    ParsedPackageSettings,
    'entryPoints' | 'externallyImported'
  > = {
    repoRootDir: TEST_PACKAGE_DIR,
    packageRootDir: TEST_PACKAGE_DIR,
    packageName: undefined,
    ignorePatterns: [{ dir: TEST_PACKAGE_DIR, contents: 'src/b*' }],
    ignoreOverridePatterns: [{ dir: TEST_PACKAGE_DIR, contents: 'src/c*' }],
    defaultIgnoreOverrides: ['.worktrees', 'dist'],
    testFilePatterns: [],
    wildcardAliases: {
      '@/': join(TEST_PACKAGE_DIR, 'src' + sep),
    },
    fixedAliases: {
      '@a': FILE_A,
    },
  };
  expect(settings).toEqual(expected);
  expect(entryPoints).toEqual([
    {
      type: 'static',
      subPath: '.',
      filePath: './src/a.ts',
    },
  ]);
  expect(externallyImported).toHaveLength(2);
  expect(externallyImported[0].file.ignores('eslint.config.mjs')).toBeTruthy();
  expect(externallyImported[1].file.ignores('src/b.ts')).toBeTruthy();
  expect(externallyImported[1].file.ignores('src/a.ts')).toBeFalsy();
});

// ─── entryPointFiles: static multi-entry-point ──────────────────────────────

it('Parses multiple static entry points', () => {
  const { packageSettings } = getAllPackageSettings({
    filename: FILE_A,
    settings: {
      'import-integrity': {
        mode: 'one-shot',
        packageRootDir: TEST_PACKAGE_DIR,
        entryPointFiles: { '.': './src/a.ts', './b': './src/b.ts' },
      },
    },
  });
  if (!packageSettings) {
    throw new Error('packageSettings should be defined');
  }
  expect(packageSettings.entryPoints).toEqual([
    { type: 'static', subPath: '.', filePath: './src/a.ts' },
    { type: 'static', subPath: './b', filePath: './src/b.ts' },
  ]);
});

// ─── entryPointFiles: dynamic/wildcard ──────────────────────────────────────

it('Parses a dynamic (wildcard) entry point', () => {
  const { packageSettings } = getAllPackageSettings({
    filename: FILE_A,
    settings: {
      'import-integrity': {
        mode: 'one-shot',
        packageRootDir: TEST_PACKAGE_DIR,
        entryPointFiles: { './lib/*': './src/lib/*.ts' },
      },
    },
  });
  if (!packageSettings) {
    throw new Error('packageSettings should be defined');
  }
  const entry = packageSettings.entryPoints[0];
  if (entry.type !== 'dynamic') {
    throw new Error(`expected dynamic entry point, got ${entry.type}`);
  }
  expect(entry.subPathPattern).toBe('./lib/*');
  expect(entry.filePattern).toBeInstanceOf(RegExp);
  // Regex should match the file pattern with the wildcard filled in and
  // capture the wildcard substitution as group 1.
  expect(entry.filePattern.test('./src/lib/foo.ts')).toBe(true);
  expect(entry.filePattern.exec('./src/lib/foo.ts')?.[1]).toBe('foo');
  expect(entry.filePattern.test('./src/otherlib/foo.ts')).toBe(false);

  // Regression guard: the `.` characters surrounding the wildcard must be
  // treated literally, not as the regex "any character" class. Before
  // escaping was added, both inputs incorrectly matched because the leading
  // `.` in `./src` and the `.` in `.ts` were each treated as "any single
  // character".
  expect(entry.filePattern.test('Z/src/lib/foo.ts')).toBe(false);
  expect(entry.filePattern.test('./src/lib/fooZts')).toBe(false);
});

it('Escapes regex metacharacters around the wildcard in a dynamic entry point', () => {
  // Directory and file names can legitimately contain regex metacharacters
  // like `()`, `+`, `$`, etc. The resulting `filePattern` must treat them as
  // literals, and the wildcard capture group must remain group 1 (a pre-
  // escaping bug would have inserted additional capture groups for the
  // literal parentheses in the path, shifting group 1 to contain `lib`
  // instead of the actual wildcard substitution).
  const { packageSettings } = getAllPackageSettings({
    filename: FILE_A,
    settings: {
      'import-integrity': {
        mode: 'one-shot',
        packageRootDir: TEST_PACKAGE_DIR,
        entryPointFiles: { './(lib)/*': './src/(lib)/*.ts' },
      },
    },
  });
  if (!packageSettings) {
    throw new Error('packageSettings should be defined');
  }
  const entry = packageSettings.entryPoints[0];
  if (entry.type !== 'dynamic') {
    throw new Error(`expected dynamic entry point, got ${entry.type}`);
  }
  expect(entry.filePattern.test('./src/(lib)/foo.ts')).toBe(true);
  expect(entry.filePattern.exec('./src/(lib)/foo.ts')?.[1]).toBe('foo');
  // Before escaping, `./src/lib/foo.ts` (without the literal parentheses)
  // would have matched because `(lib)` was treated as a capture group around
  // the literal characters `l`, `i`, `b` rather than as the literal text
  // `(lib)`.
  expect(entry.filePattern.test('./src/lib/foo.ts')).toBe(false);
});

// ─── entryPointFiles: validation errors ─────────────────────────────────────

it('Throws when entry point subpath pattern does not start with "." or "./"', () => {
  expect(() =>
    getAllPackageSettings({
      filename: FILE_A,
      settings: {
        'import-integrity': {
          mode: 'one-shot',
          packageRootDir: TEST_PACKAGE_DIR,
          entryPointFiles: { foo: './a.ts' },
        },
      },
    })
  ).toThrow(
    'Entry point subpath pattern foo must equal "." or start with "./"'
  );
});

it('Throws when entry point file pattern does not start with "./"', () => {
  expect(() =>
    getAllPackageSettings({
      filename: FILE_A,
      settings: {
        'import-integrity': {
          mode: 'one-shot',
          packageRootDir: TEST_PACKAGE_DIR,
          entryPointFiles: { '.': 'a.ts' },
        },
      },
    })
  ).toThrow('Entry point file pattern a.ts must start with "./"');
});

it('Throws when entry point subpath pattern contains more than one wildcard', () => {
  expect(() =>
    getAllPackageSettings({
      filename: FILE_A,
      settings: {
        'import-integrity': {
          mode: 'one-shot',
          packageRootDir: TEST_PACKAGE_DIR,
          entryPointFiles: { './*/*': './src/*.ts' },
        },
      },
    })
  ).toThrow(
    'Entry point subpath pattern ./*/* must not contain more than one wildcard'
  );
});

it('Throws when entry point file pattern contains more than one wildcard', () => {
  expect(() =>
    getAllPackageSettings({
      filename: FILE_A,
      settings: {
        'import-integrity': {
          mode: 'one-shot',
          packageRootDir: TEST_PACKAGE_DIR,
          entryPointFiles: { './*': './src/*/*.ts' },
        },
      },
    })
  ).toThrow(
    'Entry point file pattern ./src/*/*.ts must contain exactly one wildcard'
  );
});

it('Throws when entry point file pattern has no wildcard but subpath pattern does', () => {
  expect(() =>
    getAllPackageSettings({
      filename: FILE_A,
      settings: {
        'import-integrity': {
          mode: 'one-shot',
          packageRootDir: TEST_PACKAGE_DIR,
          entryPointFiles: { './*': './src/index.ts' },
        },
      },
    })
  ).toThrow(
    'Entry point file pattern ./src/index.ts must contain exactly one wildcard'
  );
});

it('Throws on missing settings', () => {
  expect(() =>
    getAllPackageSettings({
      filename: FILE_A,
      settings: {},
    })
  ).toThrow(
    `import-integrity-lint settings are required in your ESLint/Oxlint config file`
  );
});

it('Throws on missing packageRootDir in settings', () => {
  expect(() =>
    getAllPackageSettings({
      filename: FILE_A,
      settings: {
        'import-integrity': {},
      },
    })
  ).toThrow(`Invalid settings:
  Invalid type for property "packageRootDir"
    expected: string
    message: Invalid input: expected string, received undefined
`);
});

it('Throws on relative packageRootDir in settings', () => {
  expect(() =>
    getAllPackageSettings({
      filename: FILE_A,
      settings: {
        'import-integrity': {
          packageRootDir: './foo',
        },
      },
    })
  ).toThrow(`packageRootDir "./foo" must be absolute`);
});

it("Throws on packageRootDir that doesn't exist in settings", () => {
  expect(() =>
    getAllPackageSettings({
      filename: FILE_A,
      settings: {
        'import-integrity': {
          packageRootDir: join(TEST_PACKAGE_DIR, 'fake'),
        },
      },
    })
  ).toThrow(
    `packageRootDir "${join(TEST_PACKAGE_DIR, 'fake')}" does not exist`
  );
});

it('Throws on invalid user supplied mode', () => {
  expect(() =>
    getAllPackageSettings({
      filename: FILE_A,
      settings: {
        'import-integrity': {
          mode: 'fake',
          packageRootDir: TEST_PACKAGE_DIR,
        },
      },
    })
  ).toThrow(`Invalid settings:
  Invalid value for property "mode"
    values: auto,one-shot,fix,editor
    message: Invalid option: expected one of "auto"|"one-shot"|"fix"|"editor"
`);
});

it('Throws on mismatched wildcard aliases', () => {
  expect(() =>
    getAllPackageSettings({
      filename: FILE_A,
      settings: {
        'import-integrity': {
          packageRootDir: TEST_PACKAGE_DIR,
          alias: {
            '@/*': 'src/a.ts',
          },
        },
      },
    })
  ).toThrow(
    `Alias path ${join(TEST_PACKAGE_DIR, 'src', 'a.ts')} must end with "*" when @/* ends with "*"`
  );
});

it('Throws on mismatched fixed aliases', () => {
  expect(() =>
    getAllPackageSettings({
      filename: FILE_A,
      settings: {
        'import-integrity': {
          packageRootDir: TEST_PACKAGE_DIR,
          alias: {
            '@a': 'src/a.ts*',
          },
        },
      },
    })
  ).toThrow(
    `Alias path ${join(TEST_PACKAGE_DIR, 'src', 'a.ts*')} must not end with "*" when @a does not end with "*"`
  );
});

it('Can set mode to editor', () => {
  const editorSettings = getRepoSettings({
    filename: FILE_A,
    settings: {
      'import-integrity': {
        mode: 'editor',
        packageRootDir: TEST_PACKAGE_DIR,
      },
    },
  });
  expect(editorSettings.mode).toBe('editor');
});

it('Can set mode to fix', () => {
  const fixSettings = getRepoSettings({
    filename: FILE_A,
    settings: {
      'import-integrity': {
        mode: 'fix',
        packageRootDir: TEST_PACKAGE_DIR,
      },
    },
  });
  expect(fixSettings.mode).toBe('fix');
});

it('Ignores aliases that point outside of packageRootDir', () => {
  const { packageSettings } = getAllPackageSettings({
    filename: FILE_A,
    settings: {
      'import-integrity': {
        packageRootDir: TEST_PACKAGE_DIR,
        alias: {
          '@foo': '../foo',
          '@bar/*': '../bar/*',
        },
      },
    },
  });
  if (!packageSettings) {
    throw new Error('packageSettings should be defined');
  }
  expect(packageSettings.fixedAliases).toEqual({});
  expect(packageSettings.wildcardAliases).toEqual({});
});

// ─── getRepoSettings: single-repo ───────────────────────────────────────────

it('Returns full single-repo structure from getRepoSettings', () => {
  const repoSettings = getRepoSettings({
    filename: FILE_A,
    settings: {
      'import-integrity': {
        packageRootDir: TEST_PACKAGE_DIR,
        mode: 'one-shot',
      },
    },
  });

  const expected: ParsedRepoSettings = {
    type: 'singlerepo',
    mode: 'one-shot',
    editorUpdateRate: 500,
    repoRootDir: TEST_PACKAGE_DIR,
    packageSettings: {
      repoRootDir: TEST_PACKAGE_DIR,
      packageRootDir: TEST_PACKAGE_DIR,
    },
  };
  expect(repoSettings).toEqual(expected);
});

it('Populates package settings cache as side effect of getRepoSettings (single-repo)', () => {
  // Call getRepoSettings first (populates package settings cache as a side effect)
  getRepoSettings({
    filename: FILE_A,
    settings: {
      'import-integrity': {
        packageRootDir: TEST_PACKAGE_DIR,
        mode: 'one-shot',
      },
    },
  });

  // getPackageSettings should now return cached settings without re-parsing
  const { packageSettings } = getAllPackageSettings({
    filename: FILE_A,
    settings: {
      'import-integrity': {
        packageRootDir: TEST_PACKAGE_DIR,
        mode: 'one-shot',
      },
    },
  });

  if (!packageSettings) {
    throw new Error('packageSettings should be defined');
  }
  expect(packageSettings.packageRootDir).toBe(TEST_PACKAGE_DIR);
  expect(packageSettings.repoRootDir).toBe(TEST_PACKAGE_DIR);
});

// ─── getRepoSettings: monorepo ───────────────────────────────────────────────

it('Returns monorepo structure and discovers packages from getRepoSettings', () => {
  const repoSettings = getRepoSettings({
    filename: MONOREPO_FILE_A,
    settings: {
      'import-integrity': {
        monorepoRootDir: MONOREPO_DIR,
        mode: 'fix',
      },
    },
  });

  expect(repoSettings.type).toBe('monorepo');
  expect(repoSettings.mode).toBe('fix');
  expect(repoSettings.repoRootDir).toBe(MONOREPO_DIR);
});

it('Populates package settings cache for packageOne after monorepo getRepoSettings', () => {
  getRepoSettings({
    filename: MONOREPO_FILE_A,
    settings: {
      'import-integrity': {
        monorepoRootDir: MONOREPO_DIR,
        mode: 'fix',
      },
    },
  });

  const { packageSettings } = getAllPackageSettings({
    filename: MONOREPO_FILE_A,
    settings: {
      'import-integrity': {
        monorepoRootDir: MONOREPO_DIR,
        mode: 'fix',
      },
    },
  });

  if (!packageSettings) {
    throw new Error('packageSettings should be defined');
  }
  expect(packageSettings.packageRootDir).toBe(MONOREPO_PKG_ONE);
  expect(packageSettings.repoRootDir).toBe(MONOREPO_DIR);
});

it('Returns correct package settings for packageTwo via longest-prefix match', () => {
  getRepoSettings({
    filename: MONOREPO_FILE_A,
    settings: {
      'import-integrity': {
        monorepoRootDir: MONOREPO_DIR,
        mode: 'fix',
      },
    },
  });

  const { packageSettings } = getAllPackageSettings({
    filename: MONOREPO_FILE_C,
    settings: {
      'import-integrity': {
        monorepoRootDir: MONOREPO_DIR,
        mode: 'fix',
      },
    },
  });

  if (!packageSettings) {
    throw new Error('packageSettings should be defined');
  }
  expect(packageSettings.packageRootDir).toBe(MONOREPO_PKG_TWO);
  expect(packageSettings.repoRootDir).toBe(MONOREPO_DIR);
});

it('Returns undefined packageSettings for a file outside any known package', () => {
  getRepoSettings({
    filename: MONOREPO_FILE_A,
    settings: {
      'import-integrity': {
        monorepoRootDir: MONOREPO_DIR,
        mode: 'fix',
      },
    },
  });

  const { packageSettings } = getAllPackageSettings({
    filename: join(MONOREPO_DIR, 'eslint.config.js'),
    settings: {
      'import-integrity': {
        monorepoRootDir: MONOREPO_DIR,
        mode: 'fix',
      },
    },
  });

  expect(packageSettings).toBeUndefined();
});

it('Throws on relative monorepoRootDir', () => {
  expect(() =>
    getRepoSettings({
      filename: MONOREPO_FILE_A,
      settings: {
        'import-integrity': {
          monorepoRootDir: './foo',
        },
      },
    })
  ).toThrow(`monorepoRootDir "./foo" must be absolute`);
});

it("Throws on monorepoRootDir that doesn't exist", () => {
  expect(() =>
    getRepoSettings({
      filename: MONOREPO_FILE_A,
      settings: {
        'import-integrity': {
          monorepoRootDir: join(MONOREPO_DIR, 'fake'),
        },
      },
    })
  ).toThrow(`monorepoRootDir "${join(MONOREPO_DIR, 'fake')}" does not exist`);
});

it('Throws when mixing monorepoRootDir and packageRootDir in settings', () => {
  expect(() =>
    getRepoSettings({
      filename: MONOREPO_FILE_A,
      settings: {
        'import-integrity': {
          monorepoRootDir: MONOREPO_DIR,
          packageRootDir: TEST_PACKAGE_DIR,
        },
      },
    })
  ).toThrow('Invalid settings');
});

// ─── markSettingsForRefresh ──────────────────────────────────────────────────

it('markSettingsForRefresh forces a re-read of user settings (single-repo)', () => {
  const context = {
    filename: FILE_A,
    settings: {
      'import-integrity': {
        packageRootDir: TEST_PACKAGE_DIR,
        mode: 'fix' as string,
      },
    },
  };

  // Populate the cache; getRepoSettings returns the same object reference
  // stored in the cache, so mutating it mutates the cached value directly
  const cachedSettings = getRepoSettings(context);
  expect(cachedSettings.mode).toBe('fix');

  // Mutate the cached object in-memory
  cachedSettings.mode = 'editor';

  // The mutation is reflected because the cache still holds the same reference
  expect(getRepoSettings(context).mode).toBe('editor');

  // markSettingsForRefresh forces the next call to re-read from context.settings,
  // which still has mode: 'fix', overwriting our in-memory mutation
  markSettingsForRefresh(TEST_PACKAGE_DIR);

  expect(getRepoSettings(context).mode).toBe('fix');
});

it('markSettingsForRefresh forces a re-read of user settings (monorepo)', () => {
  const context = {
    filename: MONOREPO_FILE_A,
    settings: {
      'import-integrity': {
        monorepoRootDir: MONOREPO_DIR,
        mode: 'fix' as string,
      },
    },
  };

  // Populate the cache; same reference semantics as the single-repo case
  const cachedSettings = getRepoSettings(context);
  expect(cachedSettings.mode).toBe('fix');

  // Mutate the cached object in-memory
  cachedSettings.mode = 'editor';

  // The mutation is reflected because the cache still holds the same reference
  expect(getRepoSettings(context).mode).toBe('editor');

  // markSettingsForRefresh on a package inside the monorepo forces a re-read
  // from context.settings, which still has mode: 'fix'
  markSettingsForRefresh(MONOREPO_PKG_ONE);

  expect(getRepoSettings(context).mode).toBe('fix');
});

// ─── getUserPackageSettingsFromConfigFile ────────────────────────────────────

it('Throws a formatted error when the config file contains invalid JSON', () => {
  const configFilePath = join(TEST_PACKAGE_DIR, 'invalid.config.json');
  const packageRootDir = join(TEST_PACKAGE_DIR, 'packages', 'foo');
  expect(() =>
    getUserPackageSettingsFromConfigFile({
      configFileContents: readFileSync(configFilePath, 'utf-8'),
      repoRootDir: TEST_PACKAGE_DIR,
      packageRootDir,
    })
  ).toThrow(`Failed to parse config file for package ${packageRootDir}:`);
});

it('Parses a JSONC config file with comments and trailing commas', () => {
  const configFilePath = join(TEST_PACKAGE_DIR, 'jsonc.config.jsonc');
  const packageRootDir = join(TEST_PACKAGE_DIR, 'packages', 'foo');
  const settings = getUserPackageSettingsFromConfigFile({
    configFileContents: readFileSync(configFilePath, 'utf-8'),
    repoRootDir: TEST_PACKAGE_DIR,
    packageRootDir,
  });
  expect(settings).toEqual({
    entryPointFiles: { '.': './src/a.ts' },
    repoRootDir: TEST_PACKAGE_DIR,
    packageRootDir,
  });
});

// ─── single-repo + import-integrity.config.json(c) ────────────────────────────────

it('Loads package settings from import-integrity.config.json in single-repo mode', () => {
  const { packageSettings } = getAllPackageSettings({
    filename: CONFIG_FILE_FILE_A,
    settings: {
      'import-integrity': {
        mode: 'one-shot',
        packageRootDir: CONFIG_FILE_PACKAGE_DIR,
      },
    },
  });
  if (!packageSettings) {
    throw new Error('packageSettings should be defined');
  }
  const { entryPoints, externallyImported, ...settings } = packageSettings;
  const expected: Omit<
    ParsedPackageSettings,
    'entryPoints' | 'externallyImported'
  > = {
    repoRootDir: CONFIG_FILE_PACKAGE_DIR,
    packageRootDir: CONFIG_FILE_PACKAGE_DIR,
    packageName: undefined,
    ignorePatterns: [{ dir: CONFIG_FILE_PACKAGE_DIR, contents: 'src/b*' }],
    ignoreOverridePatterns: [
      { dir: CONFIG_FILE_PACKAGE_DIR, contents: 'src/c*' },
    ],
    defaultIgnoreOverrides: [],
    testFilePatterns: [],
    wildcardAliases: {
      '@/': join(CONFIG_FILE_PACKAGE_DIR, 'src' + sep),
    },
    fixedAliases: {
      '@a': CONFIG_FILE_FILE_A,
    },
  };
  expect(settings).toEqual(expected);
  expect(entryPoints).toEqual([
    {
      type: 'static',
      subPath: '.',
      filePath: './src/a.ts',
    },
  ]);
  expect(externallyImported).toHaveLength(2);
  expect(externallyImported[0].file.ignores('eslint.config.mjs')).toBeTruthy();
  expect(externallyImported[1].file.ignores('src/b.ts')).toBeTruthy();
  expect(externallyImported[1].file.ignores('src/a.ts')).toBeFalsy();
});

it('Throws when single-repo settings include package-level keys alongside a config file', () => {
  const expectedConfigFilePath = join(
    CONFIG_FILE_PACKAGE_DIR,
    'import-integrity.config.json'
  );
  expect(() =>
    getAllPackageSettings({
      filename: CONFIG_FILE_FILE_A,
      settings: {
        'import-integrity': {
          mode: 'one-shot',
          packageRootDir: CONFIG_FILE_PACKAGE_DIR,
          alias: { '@x': 'src/a.ts' },
        },
      },
    })
  ).toThrow(
    `Found ${expectedConfigFilePath} and package-level settings in ESLint config. Config files and package-level settings cannot be used together.`
  );
});

it('Throws when both import-integrity.config.json and .jsonc exist in packageRootDir', () => {
  expect(() =>
    getAllPackageSettings({
      filename: MULTI_CONFIG_FILE_A,
      settings: {
        'import-integrity': {
          mode: 'one-shot',
          packageRootDir: MULTI_CONFIG_PACKAGE_DIR,
        },
      },
    })
  ).toThrow(
    `Multiple import-integrity.config.json(c) files found in ${MULTI_CONFIG_PACKAGE_DIR}`
  );
});
