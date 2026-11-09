import { existsSync, readFileSync } from 'node:fs';
import { isAbsolute } from 'node:path';

import {
  DEFAULT_TOOLS,
  findRootSync,
  NoMatchingMonorepoFound,
} from '@manypkg/find-root';
import { parse, type ParseError, printParseErrorCode } from 'jsonc-parser';
import { z } from 'zod';

import type { GenericContext } from '../types/context.js';
import { exitWithError } from '../util/error.js';
import { findConfigFileIn, trimTrailingPathSeparator } from '../util/files.js';
import { debug, setVerbose, warn } from '../util/logging.js';

const globalSettingsSchema = z.strictObject({
  mode: z.enum(['auto', 'one-shot', 'fix', 'editor']).optional(),
  editorUpdateRate: z.number().optional(),
  debugLogging: z.boolean().optional(),
});

const packageSettingsSchema = z.strictObject({
  alias: z.record(z.string(), z.string()).optional(),
  entryPointFiles: z.record(z.string(), z.string()).optional(),
  externallyImportedFiles: z.array(z.string()).optional(),
  ignorePatterns: z.array(z.string()).optional(),
  ignoreOverridePatterns: z.array(z.string()).optional(),
  defaultIgnoreOverrides: z.array(z.string()).optional(),
  testFilePatterns: z.array(z.string()).optional(),
});

const singleRepoSettingsSchema = z.strictObject({
  packageRootDir: z.string(),
  ...globalSettingsSchema.shape,
  ...packageSettingsSchema.shape,
});

const monorepoPackageSettingsSchema = z.strictObject({
  monorepoRootDir: z.string(),
  ignorePackages: z.array(z.string()).optional(),
  ...globalSettingsSchema.shape,
});

const DEFAULT_EDITOR_UPDATE_RATE = 500;

// Package-level settings as written in a config file, base file, or ESLint
// settings, before they're attached to a package
type PackageConfig = z.infer<typeof packageSettingsSchema>;

export type PackageSettings = PackageConfig & {
  repoRootDir: string;
  packageRootDir: string;
};

type BaseRepoUserSettings = {
  mode: 'auto' | 'one-shot' | 'fix' | 'editor' | undefined;
  editorUpdateRate: number | undefined;
  repoRootDir: string;
};

type SingleRepoUserSettings = BaseRepoUserSettings & {
  type: 'singlerepo';
  packageSettings: PackageSettings;
};

type MonorepoUserSettings = BaseRepoUserSettings & {
  type: 'monorepo';
  ignorePackages: string[];
};

export type RepoUserSettings = SingleRepoUserSettings | MonorepoUserSettings;

// Every workspace tool @manypkg knows, without its fallback to the nearest
// package.json. Outside a workspace that fallback is almost always the package
// itself, where a base config would only duplicate the package's own config
const WORKSPACE_TOOLS = DEFAULT_TOOLS.filter((tool) => tool.type !== 'root');

// The root of the workspace a package belongs to, found the same way package
// discovery finds it in monorepo mode, so per-package runs and a root run agree
// on where the base config lives. Undefined outside a workspace, where there is
// no base config
function findWorkspaceRoot(packageRootDir: string) {
  try {
    return findRootSync(packageRootDir, { tools: WORKSPACE_TOOLS }).rootDir;
  } catch (e) {
    if (e instanceof NoMatchingMonorepoFound) {
      debug(
        `No workspace found at or above ${packageRootDir}, so no base config applies`
      );
      return undefined;
    }
    // Anything else, such as a malformed package.json beside a lockfile, can
    // come from any directory above the package, including ones unrelated to
    // this project. The lookup only serves an optional base config, so linting
    // continues without one. @manypkg's errors don't name the file it read
    warn(
      `Could not find the workspace root of package ${packageRootDir} while looking for import-integrity.base.json(c), so no base config is applied. A workspace or package manager file in that directory or a directory above it could not be read: ${e instanceof Error ? e.message : String(e)}`
    );
    return undefined;
  }
}

// Read and validate a package config file or base config file
export function readPackageConfigFile(filePath: string): PackageConfig {
  // Parse the config file contents from JSON-C. jsonc-parser's parse() does not
  // throw on malformed input — it returns a best-effort partial result and
  // reports issues via the errors out-parameter, so we surface those manually.
  const errors: ParseError[] = [];
  const config: unknown = parse(readFileSync(filePath, 'utf-8'), errors, {
    allowTrailingComma: true,
  });
  if (errors.length > 0) {
    const formatted = errors
      .map(
        (e) => `${printParseErrorCode(e.error)} at offset ${String(e.offset)}`
      )
      .join(', ');
    exitWithError(`Failed to parse ${filePath}: ${formatted}`);
  }

  // Validate the parsed config data and return the results
  const parseResult = packageSettingsSchema.safeParse(config);
  if (!parseResult.success) {
    exitWithError(
      `Invalid settings in ${filePath}:\n${z.prettifyError(parseResult.error)}`
    );
  }
  return parseResult.data;
}

// Read the base config at the root of a workspace, whose package-level settings
// apply to every package unless the package's own settings replace them
export function readBaseSettings(rootDir: string): PackageConfig | undefined {
  const baseConfigFilePath = findConfigFileIn(rootDir, 'base');
  if (!baseConfigFilePath) {
    debug(`No base config found in workspace root ${rootDir}`);
    return undefined;
  }
  debug(`Using base config ${baseConfigFilePath}`);
  return readPackageConfigFile(baseConfigFilePath);
}

// A package's settings: its own settings, from its config file or the ESLint
// settings, laid over the base config option by option
export function layerPackageSettings({
  baseSettings,
  ownSettings,
  repoRootDir,
  packageRootDir,
}: {
  baseSettings: PackageConfig | undefined;
  ownSettings: PackageConfig | undefined;
  repoRootDir: string;
  packageRootDir: string;
}): PackageSettings {
  return { ...baseSettings, ...ownSettings, repoRootDir, packageRootDir };
}

export function getUserRepoSettings(
  settings: GenericContext['settings'] | undefined
): RepoUserSettings & { editorUpdateRate: number } {
  // Parse the raw settings, if supplied
  const importIntegritySettings = settings?.['import-integrity'];
  if (!importIntegritySettings) {
    exitWithError(
      `import-integrity-lint settings are required in your ESLint/Oxlint config file`
    );
  }

  // Check if this is a monorepo configuration
  if (
    typeof importIntegritySettings === 'object' &&
    'monorepoRootDir' in importIntegritySettings
  ) {
    const parseResult = monorepoPackageSettingsSchema.safeParse(
      importIntegritySettings
    );
    if (!parseResult.success) {
      exitWithError(`Invalid settings:\n${z.prettifyError(parseResult.error)}`);
    }

    // Split props apart so we can recombine them in the standardized format
    const {
      debugLogging = false,
      mode,
      editorUpdateRate = DEFAULT_EDITOR_UPDATE_RATE,
      monorepoRootDir,
      ignorePackages = [],
    } = parseResult.data;

    // Validate monorepoRootDir exists
    if (!isAbsolute(monorepoRootDir)) {
      exitWithError(`monorepoRootDir "${monorepoRootDir}" must be absolute`);
    } else if (!existsSync(monorepoRootDir)) {
      exitWithError(`monorepoRootDir "${monorepoRootDir}" does not exist`);
    }

    // Trim off the end `/` in case it was supplied
    const trimmedMonorepoRootDir = trimTrailingPathSeparator(monorepoRootDir);

    // Set verbose logging, if enabled
    setVerbose(debugLogging);

    // Return formatted user supplied settings, minus debug logging
    return {
      type: 'monorepo',
      mode,
      editorUpdateRate,
      repoRootDir: trimmedMonorepoRootDir,
      ignorePackages,
    };
  } else {
    const parseResult = singleRepoSettingsSchema.safeParse(
      importIntegritySettings
    );
    if (!parseResult.success) {
      exitWithError(`Invalid settings:\n${z.prettifyError(parseResult.error)}`);
    }

    // Split props apart so we can recombine them in the standardized format
    const {
      debugLogging = false,
      mode,
      editorUpdateRate = DEFAULT_EDITOR_UPDATE_RATE,
      packageRootDir,
      ...packageSettings
    } = parseResult.data;

    // Validate packageRootDir exists
    if (!isAbsolute(packageRootDir)) {
      exitWithError(`packageRootDir "${packageRootDir}" must be absolute`);
    } else if (!existsSync(packageRootDir)) {
      exitWithError(`packageRootDir "${packageRootDir}" does not exist`);
    }

    // Trim off the end `/` in case it was supplied
    const trimmedPackageRootDir = trimTrailingPathSeparator(packageRootDir);

    // Set verbose logging, if enabled
    setVerbose(debugLogging);

    // If a import-integrity.config.json(c) file exists in packageRootDir, load
    // package-level settings from it. This lets the same config file serve a
    // root-level monorepo config and a per-package single-repo config without
    // duplication. Mixing the two sources is rejected to keep a single source
    // of truth per package.
    const configFilePath = findConfigFileIn(trimmedPackageRootDir, 'config');
    if (configFilePath && Object.keys(packageSettings).length > 0) {
      exitWithError(
        `Found ${configFilePath} and package-level settings in ESLint config. Config files and package-level settings cannot be used together.`
      );
    }

    // The base config, if any, sits under whichever source the package's own
    // settings come from
    const workspaceRootDir = findWorkspaceRoot(trimmedPackageRootDir);

    // Return formatted user supplied settings, minus debug logging
    return {
      type: 'singlerepo',
      mode,
      editorUpdateRate,
      repoRootDir: trimmedPackageRootDir,
      packageSettings: layerPackageSettings({
        baseSettings: workspaceRootDir
          ? readBaseSettings(workspaceRootDir)
          : undefined,
        ownSettings: configFilePath
          ? readPackageConfigFile(configFilePath)
          : packageSettings,
        repoRootDir: trimmedPackageRootDir,
        packageRootDir: trimmedPackageRootDir,
      }),
    };
  }
}
