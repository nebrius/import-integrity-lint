import { isAbsolute, resolve } from 'node:path';

import type { JSONSchema4 } from '@typescript-eslint/utils/json-schema';
import { z } from 'zod';

import { exitWithError } from '../../util/error.js';
import {
  createRule,
  getESMInfo,
  getLocFromRange,
  isTypeOnly,
} from '../util.js';

const firstPartyEntrySchema = z.strictObject({
  type: z.enum(['first-party']),
  filepath: z.union([z.string(), z.instanceof(RegExp)]),
  allowed: z.array(z.union([z.string(), z.instanceof(RegExp)])).optional(),
  denied: z.array(z.union([z.string(), z.instanceof(RegExp)])).optional(),
  excludeTypeImports: z.boolean().optional(),
  message: z.string().optional(),
});

const thirdPartyEntrySchema = z.strictObject({
  type: z.enum(['third-party', 'built-in']),
  moduleSpecifier: z.union([z.string(), z.instanceof(RegExp)]),
  allowed: z.array(z.union([z.string(), z.instanceof(RegExp)])).optional(),
  denied: z.array(z.union([z.string(), z.instanceof(RegExp)])).optional(),
  excludeTypeImports: z.boolean().optional(),
  message: z.string().optional(),
});

const entrySchema = z.union([firstPartyEntrySchema, thirdPartyEntrySchema]);
const schema = z.strictObject({
  rules: z.array(entrySchema),
});

type FirstPartyEntry = z.infer<typeof firstPartyEntrySchema>;
type ThirdPartyEntry = z.infer<typeof thirdPartyEntrySchema>;
type Entry = FirstPartyEntry | ThirdPartyEntry;

function replaceMatchesInRegex(regex: RegExp, matches: string[] | null) {
  if (!matches) {
    return regex;
  }
  let source = regex.source;
  for (let i = 0; i < matches.length; i++) {
    source = source.replaceAll('$' + (i + 1).toString(), matches[i]);
  }
  return new RegExp(source, regex.flags);
}

// The rule restricts nothing without options, so it has no default: enabling
// it without any is a configuration mistake
export const noRestrictedImports = createRule<
  [options?: { rules: Entry[] }],
  'restrictedImport'
>({
  name: 'no-restricted-imports',
  meta: {
    docs: {
      description:
        'Ensures restricted imports are only imported by allowed consumers',
    },
    schema: {
      type: 'array',
      items: [schema.toJSONSchema({ unrepresentable: 'any' }) as JSONSchema4],
      minItems: 1,
      maxItems: 1,
    },
    fixable: undefined,
    type: 'problem',
    messages: {
      restrictedImport: '{{message}}',
    },
  },
  create(context) {
    // The schema already requires options, but validation can't be relied on:
    // ESLint 9 has been seen running rules whose options fail it, and Oxlint
    // may not check it at all
    const [options] = context.options;
    if (!options) {
      exitWithError(
        'Rule import-integrity/no-restricted-imports was enabled without options. It needs a `rules` array describing which imports to restrict'
      );
    }

    const esmInfo = getESMInfo(context);

    // No package info means this file wasn't found as part of the package, e.g.
    // because it's ignored
    /* istanbul ignore if */
    if (!esmInfo) {
      return {};
    }

    const { fileInfo } = esmInfo;
    /* istanbul ignore if */
    if (fileInfo.fileType !== 'code') {
      return {};
    }

    // Normalize allowed and denied string paths to absolute
    const entries: Entry[] = [];
    for (const originalEntry of options.rules) {
      const entry = { ...originalEntry };
      entries.push(entry);
      if (entry.allowed) {
        entry.allowed = entry.allowed.map((allowed) => {
          if (typeof allowed === 'string' && !isAbsolute(allowed)) {
            return resolve(esmInfo.packageInfo.packageRootDir, allowed);
          }
          return allowed;
        });
      }
      if (entry.denied) {
        entry.denied = entry.denied.map((denied) => {
          if (typeof denied === 'string' && !isAbsolute(denied)) {
            return resolve(esmInfo.packageInfo.packageRootDir, denied);
          }
          return denied;
        });
      }
      if (entry.type === 'first-party') {
        // Normalize string paths to absolute
        if (typeof entry.filepath === 'string' && !isAbsolute(entry.filepath)) {
          entry.filepath = resolve(
            esmInfo.packageInfo.packageRootDir,
            entry.filepath
          );
        }
      }
    }

    // Check each import and reexport
    for (const importEntry of [
      ...fileInfo.singleImports,
      ...fileInfo.barrelImports,
      ...fileInfo.dynamicImports,
      ...fileInfo.sideEffectImports,
      ...fileInfo.singleReexports,
      ...fileInfo.barrelReexports,
    ]) {
      const { moduleSpecifier } = importEntry;
      // A dynamic import with a non-literal specifier can't be matched
      if (moduleSpecifier === undefined) {
        continue;
      }

      for (const entry of entries) {
        if (entry.excludeTypeImports && isTypeOnly(importEntry)) {
          continue;
        }
        // Check if this import applies to this entry
        let matches: string[] | null = null;
        switch (entry.type) {
          case 'third-party':
          case 'built-in': {
            // Check if the module specifier matches
            if (typeof entry.moduleSpecifier === 'string') {
              if (entry.moduleSpecifier !== moduleSpecifier) {
                continue;
              }
            } else if (!entry.moduleSpecifier.test(moduleSpecifier)) {
              continue;
            }
            break;
          }
          case 'first-party': {
            // First we have to make sure we could resolve the module specifier to
            // a file path. Otherwise we ignore it, since this is either a broken
            // import or a dynamic import
            if (!importEntry.resolvedModulePath) {
              continue;
            }

            // Check if the resolved module path matches
            if (typeof entry.filepath === 'string') {
              if (entry.filepath !== importEntry.resolvedModulePath) {
                continue;
              }
            } else {
              const match = entry.filepath.exec(importEntry.resolvedModulePath);
              if (!match) {
                continue;
              }
              if (match.length > 1) {
                matches = match.slice(1);
              }
            }
            break;
          }
        }

        // Check if the module specifier is allowed
        if (entry.allowed) {
          let isAllowed = false;
          for (const allowed of entry.allowed) {
            if (typeof allowed === 'string') {
              if (allowed === context.filename) {
                isAllowed = true;
              }
            } else if (
              replaceMatchesInRegex(allowed, matches).test(context.filename)
            ) {
              isAllowed = true;
            }
          }
          if (!isAllowed) {
            context.report({
              loc: getLocFromRange(context, importEntry.statementNodeRange),
              messageId: 'restrictedImport',
              data: {
                message:
                  entry.message ??
                  `${context.filename} is not allowed to import ${moduleSpecifier}`,
              },
            });
            continue;
          }
        }

        // Check if the module specifier is denied
        if (entry.denied) {
          let isDenied = false;
          for (const denied of entry.denied) {
            if (typeof denied === 'string') {
              if (denied === context.filename) {
                isDenied = true;
              }
            } else if (
              replaceMatchesInRegex(denied, matches).test(context.filename)
            ) {
              isDenied = true;
            }
          }
          if (isDenied) {
            context.report({
              loc: getLocFromRange(context, importEntry.statementNodeRange),
              messageId: 'restrictedImport',
              data: {
                message:
                  entry.message ??
                  `${context.filename} is denied from importing ${moduleSpecifier}`,
              },
            });
          }
        }
      }
    }

    return {};
  },
});
