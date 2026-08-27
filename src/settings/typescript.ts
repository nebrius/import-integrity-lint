import { existsSync, readFileSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';

import ts from 'typescript';

import { VALID_EXTENSIONS } from '../util/code.js';
import { isDefaultIgnoredPath } from '../util/files.js';
import { warn } from '../util/logging.js';
import type { PackageSettings } from './user.js';

type TypeScriptSettings = Pick<PackageSettings, 'alias'> & {
  rootDir?: string;
  outDir?: string;
};

type ExtendedTypeScriptSettings = Pick<PackageSettings, 'alias'> & {
  mapping:
    | {
        rootDir: string;
        outDir: string;
      }
    | undefined;
};

export function getTypeScriptSettings(
  packageRootDir: string,
  defaultIgnoreOverrides: string[]
): ExtendedTypeScriptSettings {
  // Read in the file. Note: we don't support the full breadth of tsconfigs,
  // notably we don't support multiple nested configs and only look at the
  // config found in the eslint config file's directory
  const configPath = ts.findConfigFile(
    packageRootDir,
    ts.sys.fileExists.bind(ts.sys),
    'tsconfig.json'
  );
  // Since we've got a tsconfig.json file for this repo, it's not actually
  // possible to test this code path
  /* istanbul ignore if */
  if (!configPath) {
    return {
      mapping: undefined,
    };
  }

  const { alias, rootDir, outDir } = parseTsConfig(
    configPath,
    defaultIgnoreOverrides
  );

  if (rootDir && outDir) {
    return {
      alias,
      mapping: {
        rootDir,
        outDir,
      },
    };
  } else {
    return {
      alias,
      mapping: undefined,
    };
  }
}

// Normalize a path to be a relative path that starts with ./ or ../
function normalizePath(
  path: string | undefined,
  configPath: string
): string | undefined {
  if (!path) {
    return undefined;
  }
  // If absolute, make it relative to the tsconfig location first
  if (isAbsolute(path)) {
    path = relative(dirname(configPath), path);
  }

  // Now check if it's the shortform of a relative path
  if (!path.startsWith('./') && !path.startsWith('../')) {
    path = './' + path;
  }

  // Otherwise, return as-is
  return path;
}

// Resolve a tsconfig `paths` entry to an absolute path on disk, mirroring the
// subset of TypeScript's resolution behavior we care about for alias tracking.
//
// - Wildcard entries (`@/*` -> `src/*`) keep the `*` in the returned path; we
//   only verify that the directory portion exists, since the wildcard is
//   substituted at import resolution time.
// - Direct file matches (e.g. `src/a.ts`) are returned as-is.
// - Directories are resolved to their `index.<ext>` if one exists, otherwise
//   the directory path itself is returned.
// - Bare module-style entries (e.g. `./foo` referring to `./foo.ts`) are
//   resolved by appending the supported code extensions in order.
//
// Returns `undefined` if nothing on disk matches, so the caller can skip the
// alias instead of throwing.
function resolveTsConfigPathEntry(
  absolutePathEntry: string
): string | undefined {
  if (absolutePathEntry.includes('*')) {
    return existsSync(absolutePathEntry.replace('*', ''))
      ? absolutePathEntry
      : undefined;
  }

  if (existsSync(absolutePathEntry)) {
    let isDirectory = false;
    try {
      isDirectory = statSync(absolutePathEntry).isDirectory();
    } catch {
      // Race conditions on the filesystem are rare but possible; treat as
      // a non-directory match.
    }
    if (isDirectory) {
      for (const ext of VALID_EXTENSIONS) {
        const indexCandidate = join(absolutePathEntry, 'index' + ext);
        if (existsSync(indexCandidate)) {
          return indexCandidate;
        }
      }
    }
    return absolutePathEntry;
  }

  // TypeScript's `paths` convention allows pointing to a module specifier
  // without an extension (e.g. `"foo": ["./bar"]` referring to `./bar.ts`).
  // Try the supported code extensions in order.
  for (const ext of VALID_EXTENSIONS) {
    const candidate = absolutePathEntry + ext;
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  return undefined;
}

function parseTsConfig(
  configPath: string,
  defaultIgnoreOverrides: string[],
  projectRootDir?: string
): TypeScriptSettings {
  const config = ts.readConfigFile(configPath, (file) =>
    readFileSync(file, 'utf-8')
  );

  // Handle errors in reading the file
  if (config.error) {
    // Technically there could be multiple errors in a chain, but we pretend as
    // if there's only one, since users will have other, more detailed errors in
    // their editor
    const errorText =
      typeof config.error.messageText === 'string'
        ? config.error.messageText
        : config.error.messageText.messageText;
    warn(
      `Could not load TypeScript config from ${configPath}, skipping settings analysis:\n  ${errorText}`
    );
    return {};
  }

  // I'm pretty sure this is impossible since we already checked error above,
  // and the TS types for config are just too loose, but check just in case
  /* istanbul ignore if */
  if (!config.config) {
    warn(
      `Could not load TypeScript config from ${configPath}, skipping settings analysis:\n  empty config`
    );
    return {};
  }

  const packageRootDir = normalizePath(
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access
    config.config?.compilerOptions?.rootDir,
    configPath
  );
  const absoluteRootDir =
    projectRootDir ??
    (packageRootDir && join(dirname(configPath), packageRootDir));

  const outDir = normalizePath(
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access
    config.config?.compilerOptions?.outDir,
    configPath
  );

  // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
  const configExtends = config.config?.extends as string | undefined;
  let baseConfig: TypeScriptSettings = {};
  if (typeof configExtends === 'string') {
    // Check if this is a relative path or package path
    if (configExtends.startsWith('.')) {
      baseConfig = parseTsConfig(
        resolve(dirname(configPath), configExtends),
        defaultIgnoreOverrides,
        absoluteRootDir
      );
    } else {
      // Package path - resolve using Node.js module resolution
      const require = createRequire(configPath);
      try {
        const resolvedPath = require.resolve(configExtends);
        baseConfig = parseTsConfig(
          resolvedPath,
          defaultIgnoreOverrides,
          absoluteRootDir
        );
      } catch {
        warn(
          `Could not resolve tsconfig extends path "${configExtends}" in ${configPath}`
        );
      }
    }
  }

  let baseUrl =
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    (config.config?.compilerOptions?.baseUrl as string | undefined) ??
    dirname(configPath);

  if (!isAbsolute(baseUrl)) {
    baseUrl = resolve(dirname(configPath), baseUrl);
  }

  const paths =
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    (config.config?.compilerOptions?.paths as
      | Record<string, string[]>
      | undefined) ?? {};

  const parsedPaths: Record<string, string> = {};
  for (const [symbol, path] of Object.entries(paths)) {
    if (path.length !== 1) {
      warn(
        `import-integrity only supports tsconfig.compilerOptions.paths entries with exactly one path. ${symbol} in ${configPath} will be ignored.`
      );
      continue;
    }

    const absolutePathEntry = resolve(baseUrl, path[0]);
    const resolvedPathEntry = resolveTsConfigPathEntry(absolutePathEntry);
    if (!resolvedPathEntry) {
      // TypeScript's own behavior is to silently skip paths that don't resolve
      // to anything on disk, since the entry might still be valid for IDEs or
      // other tooling. Match that with a warning so a single iffy alias does
      // not take down the whole rule.
      warn(
        `tsconfig path "${path[0]}", resolved as "${absolutePathEntry}", does not exist; alias "${symbol}" in ${configPath} will be ignored`
      );
      continue;
    }
    if (
      !resolvedPathEntry.startsWith(absoluteRootDir ?? dirname(configPath)) ||
      isDefaultIgnoredPath(resolvedPathEntry, defaultIgnoreOverrides)
    ) {
      continue;
    }

    parsedPaths[symbol] = resolvedPathEntry;
  }

  return {
    alias: { ...parsedPaths, ...baseConfig.alias },
    rootDir: packageRootDir,
    outDir,
  };
}
