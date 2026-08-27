import { existsSync, readFileSync } from 'node:fs';
import { isAbsolute } from 'node:path';

import { parse, printParseErrorCode } from 'jsonc-parser';
import { z, type ZodError } from 'zod';

import type { GenericContext } from '../types/context.js';
import { exitWithError } from '../util/error.js';
import {
  findPackageConfigFile,
  trimTrailingPathSeparator,
} from '../util/files.js';
import { setVerbose } from '../util/logging.js';

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
  ...globalSettingsSchema.shape,
});

const DEFAULT_EDITOR_UPDATE_RATE = 500;

export type PackageSettings = z.infer<typeof packageSettingsSchema> & {
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
};

export type RepoUserSettings = SingleRepoUserSettings | MonorepoUserSettings;

// If there were errors, print a friendly-ish explanation of them
function throwFormattedErrors(error: ZodError): never {
  const issues: string[] = [];
  for (const issue of error.issues) {
    let formattedIssue = issue.code.replace('_', ' ');
    formattedIssue = `  ${formattedIssue[0].toUpperCase() + formattedIssue.slice(1)}`;
    if (issue.path.length) {
      formattedIssue += ` for property "${issue.path.join('.')}"\n`;
    } else {
      formattedIssue += '\n';
    }
    for (const [key, value] of Object.entries(issue)) {
      if (key !== 'code' && key !== 'path') {
        formattedIssue += `    ${key}: ${String(value)}\n`;
      }
    }
    issues.push(formattedIssue);
  }
  exitWithError('Invalid settings:\n' + issues.join('\n'));
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
      throwFormattedErrors(parseResult.error);
    }

    // Split props apart so we can recombine them in the standardized format
    const {
      debugLogging = false,
      mode,
      editorUpdateRate = DEFAULT_EDITOR_UPDATE_RATE,
      monorepoRootDir,
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
    };
  } else {
    const parseResult = singleRepoSettingsSchema.safeParse(
      importIntegritySettings
    );
    if (!parseResult.success) {
      throwFormattedErrors(parseResult.error);
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
    const configFilePath = findPackageConfigFile(trimmedPackageRootDir);
    let resolvedPackageSettings: PackageSettings;
    if (configFilePath) {
      if (Object.keys(packageSettings).length > 0) {
        exitWithError(
          `Found ${configFilePath} and package-level settings in ESLint config. Config files and package-level settings cannot be used together.`
        );
      }
      const configFileContents = readFileSync(configFilePath, 'utf-8');
      resolvedPackageSettings = getUserPackageSettingsFromConfigFile({
        configFileContents,
        repoRootDir: trimmedPackageRootDir,
        packageRootDir: trimmedPackageRootDir,
      });
    } else {
      resolvedPackageSettings = {
        ...packageSettings,
        repoRootDir: trimmedPackageRootDir,
        packageRootDir: trimmedPackageRootDir,
      };
    }

    // Return formatted user supplied settings, minus debug logging
    return {
      type: 'singlerepo',
      mode,
      editorUpdateRate,
      repoRootDir: trimmedPackageRootDir,
      packageSettings: resolvedPackageSettings,
    };
  }
}

export function getUserPackageSettingsFromConfigFile({
  configFileContents,
  repoRootDir,
  packageRootDir,
}: {
  repoRootDir: string;
  packageRootDir: string;
  configFileContents: string;
}): PackageSettings {
  // Parse the config file contents from JSON-C. jsonc-parser's parse() does not
  // throw on malformed input — it returns a best-effort partial result and
  // reports issues via the errors out-parameter, so we surface those manually.
  const errors: Array<{ error: number; offset: number; length: number }> = [];
  const config: unknown = parse(configFileContents, errors, {
    allowTrailingComma: true,
  });
  if (errors.length > 0) {
    const formatted = errors
      .map(
        (e) => `${printParseErrorCode(e.error)} at offset ${String(e.offset)}`
      )
      .join(', ');
    exitWithError(
      `Failed to parse config file for package ${packageRootDir}: ${formatted}`
    );
  }

  // Validate the parsed config data and return the results
  const parseResult = packageSettingsSchema.safeParse(config);
  if (!parseResult.success) {
    throwFormattedErrors(parseResult.error);
  }
  return {
    ...parseResult.data,
    repoRootDir,
    packageRootDir,
  };
}
