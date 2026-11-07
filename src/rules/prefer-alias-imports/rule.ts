import { dirname, relative, resolve } from 'node:path';

import type { TSESTree } from '@typescript-eslint/typescript-estree';
import type { JSONSchema4 } from '@typescript-eslint/utils/json-schema';
import { z } from 'zod';

import { exitWithInternalError } from '../../util/error.js';
import { createRule, getESMInfo, getLocFromRange } from '../util.js';

type ImportDeclaration = TSESTree.ImportDeclaration | TSESTree.ImportExpression;
type ReexportDeclaration =
  | TSESTree.ExportNamedDeclarationWithSource
  | TSESTree.ExportAllDeclaration;

const MODE_DEFAULT = 'relative-if-local';
const MIN_SHARED_PATH_DEPTH_DEFAULT = 1;

const schema = z
  .strictObject({
    mode: z.enum(['always', 'relative-if-local']).optional(),
    minSharedPathDepth: z.number().int().min(0).optional(),
  })
  .optional();
type Options = z.infer<typeof schema>;

/**
 * Find the best matching wildcard alias for an absolute path.
 * Returns the entry with the longest (most specific) path match.
 */
function findBestWildcardAlias(
  absolutePath: string,
  wildcardAliases: Record<string, string>
): { symbol: string; path: string } | undefined {
  let best: { symbol: string; path: string } | undefined;
  for (const [symbol, path] of Object.entries(wildcardAliases)) {
    if (
      absolutePath.startsWith(path) &&
      (!best || path.length > best.path.length)
    ) {
      best = { symbol, path };
    }
  }
  return best;
}

function getAliasInternalPathSegments(absolutePath: string, aliasPath: string) {
  if (!absolutePath.startsWith(aliasPath)) {
    return;
  }

  return absolutePath
    .slice(aliasPath.length)
    .split(/[/\\]+/)
    .filter(Boolean);
}

function getSharedPathDepth(
  sourcePath: string,
  targetPath: string,
  aliasPath: string
) {
  const sourceSegments = getAliasInternalPathSegments(sourcePath, aliasPath);
  const targetSegments = getAliasInternalPathSegments(targetPath, aliasPath);

  if (!sourceSegments || !targetSegments) {
    return;
  }

  let sharedPathDepth = 0;
  while (
    sharedPathDepth < sourceSegments.length &&
    sharedPathDepth < targetSegments.length &&
    sourceSegments[sharedPathDepth] === targetSegments[sharedPathDepth]
  ) {
    sharedPathDepth++;
  }

  return sharedPathDepth;
}

export const preferAliasImports = createRule<
  [Options],
  'preferAlias' | 'preferRelative'
>({
  name: 'prefer-alias-imports',
  meta: {
    docs: {
      description:
        'Enforces the use of alias imports instead of relative paths when an alias is available, and vice versa for sufficiently local files under the same alias',
    },
    schema: [schema.toJSONSchema() as JSONSchema4],
    fixable: 'code',
    type: 'suggestion',
    messages: {
      preferAlias:
        'Use alias import "{{alias}}" instead of relative path "{{relative}}"',
      preferRelative:
        'Use relative import "{{relative}}" instead of alias "{{alias}}" for local files under the same alias',
    },
  },
  defaultOptions: [{ mode: MODE_DEFAULT }],
  create(context) {
    const esmInfo = getESMInfo(context);

    /* istanbul ignore if */
    if (!esmInfo) {
      return {};
    }

    const { fileInfo, packageSettings } = esmInfo;
    /* istanbul ignore if */
    if (fileInfo.fileType !== 'code') {
      return {};
    }

    const { wildcardAliases, fixedAliases } = packageSettings;

    // No aliases configured — nothing to enforce
    if (
      Object.keys(wildcardAliases).length === 0 &&
      Object.keys(fixedAliases).length === 0
    ) {
      return {};
    }

    const {
      mode = MODE_DEFAULT,
      minSharedPathDepth = MIN_SHARED_PATH_DEPTH_DEFAULT,
    } = context.options[0] ?? {};

    // Pre-compute the current file's "home alias" for relative-if-local mode
    const homeAlias = findBestWildcardAlias(context.filename, wildcardAliases);

    for (const importEntry of [
      ...fileInfo.singleImports,
      ...fileInfo.barrelImports,
      ...fileInfo.dynamicImports,
      ...fileInfo.sideEffectImports,
      ...fileInfo.singleReexports,
      ...fileInfo.barrelReexports,
    ]) {
      const { moduleSpecifier, resolvedModuleType, statementNodeRange } =
        importEntry;

      if (
        // A dynamic import with a non-literal specifier has nothing to rewrite
        moduleSpecifier === undefined ||
        (resolvedModuleType !== 'firstPartyCode' &&
          resolvedModuleType !== 'firstPartyOther')
      ) {
        continue;
      }

      if (moduleSpecifier.startsWith('.')) {
        // --- Relative import: check if it should use an alias ---

        // Check fixed aliases first (exact resolvedModulePath match)
        const { resolvedModulePath } = importEntry;
        let matchedAliasName: string | undefined;
        let matchedAliasSymbol: string | undefined;
        let matchedAliasPath: string | undefined;

        if (resolvedModulePath) {
          for (const [alias, path] of Object.entries(fixedAliases)) {
            if (resolvedModulePath === path) {
              matchedAliasName = alias;
              break;
            }
          }
        }

        // Check wildcard aliases
        if (!matchedAliasName && resolvedModulePath) {
          const match = findBestWildcardAlias(
            resolvedModulePath,
            wildcardAliases
          );
          if (match) {
            matchedAliasSymbol = match.symbol;
            matchedAliasPath = match.path;
          }
        }

        if (!matchedAliasName && !matchedAliasSymbol) {
          continue;
        }

        const sharedPathDepth =
          homeAlias &&
          resolvedModulePath &&
          matchedAliasSymbol === homeAlias.symbol &&
          matchedAliasPath === homeAlias.path
            ? getSharedPathDepth(
                context.filename,
                resolvedModulePath,
                homeAlias.path
              )
            : undefined;

        // In relative-if-local mode, skip if the files are local enough
        if (mode === 'relative-if-local') {
          if (matchedAliasName) {
            // Fixed alias — always different from a wildcard home alias, so report
          } else if (
            homeAlias &&
            matchedAliasSymbol === homeAlias.symbol &&
            matchedAliasPath === homeAlias.path &&
            sharedPathDepth !== undefined &&
            sharedPathDepth >= minSharedPathDepth
          ) {
            continue;
          }
        }

        let newSpecifier: string;
        if (matchedAliasName) {
          newSpecifier = matchedAliasName;
        } else if (matchedAliasSymbol && matchedAliasPath) {
          newSpecifier =
            matchedAliasSymbol +
            resolve(dirname(context.filename), moduleSpecifier).slice(
              matchedAliasPath.length
            );
        } else {
          continue;
        }

        context.report({
          messageId: 'preferAlias',
          loc: getLocFromRange(context, importEntry.reportNodeRange),
          data: { alias: newSpecifier, relative: moduleSpecifier },
          fix(fixer) {
            const sourceNode = context.sourceCode.getNodeByRangeIndex(
              statementNodeRange[0]
            ) as ImportDeclaration | ReexportDeclaration;
            /* istanbul ignore if */
            if (!('raw' in sourceNode.source)) {
              exitWithInternalError(
                `Property "raw" is missing in sourceNode.source`
              );
            }
            return fixer.replaceText(
              sourceNode.source,
              sourceNode.source.raw.replace(moduleSpecifier, newSpecifier)
            );
          },
        });
      } else if (mode === 'relative-if-local') {
        // --- Alias import: check if it should be relative ---

        if (moduleSpecifier in fixedAliases) {
          continue;
        }

        if (!importEntry.resolvedModulePath) {
          continue;
        }

        const matchedAlias = findBestWildcardAlias(
          importEntry.resolvedModulePath,
          wildcardAliases
        );

        const sharedPathDepth =
          homeAlias && matchedAlias && matchedAlias.path === homeAlias.path
            ? getSharedPathDepth(
                context.filename,
                importEntry.resolvedModulePath,
                homeAlias.path
              )
            : undefined;

        if (
          matchedAlias &&
          homeAlias &&
          matchedAlias.symbol === homeAlias.symbol &&
          matchedAlias.path === homeAlias.path &&
          sharedPathDepth !== undefined &&
          sharedPathDepth >= minSharedPathDepth
        ) {
          let newSpecifier = relative(
            dirname(context.filename),
            resolve(
              matchedAlias.path,
              moduleSpecifier.slice(matchedAlias.symbol.length)
            )
          );
          if (!newSpecifier.startsWith('.')) {
            newSpecifier = './' + newSpecifier;
          }

          context.report({
            messageId: 'preferRelative',
            loc: getLocFromRange(context, importEntry.reportNodeRange),
            data: { relative: newSpecifier, alias: moduleSpecifier },
            fix(fixer) {
              const sourceNode = context.sourceCode.getNodeByRangeIndex(
                statementNodeRange[0]
              ) as ImportDeclaration | ReexportDeclaration;
              /* istanbul ignore if */
              if (!('raw' in sourceNode.source)) {
                exitWithInternalError(
                  `Property "raw" is missing in sourceNode.source`
                );
              }
              return fixer.replaceText(
                sourceNode.source,
                sourceNode.source.raw.replace(moduleSpecifier, newSpecifier)
              );
            },
          });
        }

        // Fixed aliases that match the home alias scope could also be flagged,
        // but fixed aliases are exact-match by nature — they don't have a
        // "scope" in the same way. We leave them alone.
      }
    }

    return {};
  },
});
