import { isAbsolute, resolve } from 'node:path';
import { isRegExp } from 'node:util/types';

import type { JSONSchema4 } from '@typescript-eslint/utils/json-schema';
import { z } from 'zod';

import { escapeRegExp } from '../../util/code.js';
import { exitWithError } from '../../util/error.js';
import {
  createRule,
  getESMInfo,
  getLocFromRange,
  isTypeOnly,
} from '../util.js';

const RULE_NAME = 'import-integrity/no-restricted-imports';

// A RegExp written as plain data, for configs that are serialized to JSON on
// the way to the rule (JSON config files, and every Oxlint config), where a
// RegExp literal doesn't survive
const regexObjectSchema = z.strictObject({
  regex: z.string(),
  flags: z.string().optional(),
});

const SERIALIZED_REGEXP_HINT =
  'Expected a string, a RegExp, or { regex, flags? }, but got an empty object. ' +
  'This is what a RegExp literal becomes after JSON serialization, which Oxlint applies to its config, including oxlint.config.ts. ' +
  'Use { regex: "..." } instead';

// Matches either an escaped character, which is passed through untouched (so
// `\$1` stays a literal `$1`), or a capture group reference such as `$1`. All
// digits after the `$` belong to the reference
const GROUP_REFERENCE_REGEX = /\\.|\$(\d+)/g;

// The capture group numbers a regex source refers to
function getGroupReferences(source: string) {
  const references: number[] = [];
  for (const match of source.matchAll(GROUP_REFERENCE_REGEX)) {
    const reference = match.at(1);
    if (reference !== undefined) {
      references.push(Number(reference));
    }
  }
  return references;
}

function countCaptureGroups(pattern: string | RegExp) {
  if (typeof pattern === 'string') {
    return 0;
  }
  // The empty alternative makes the match always succeed, and the result then
  // has one entry per capture group plus the whole match. Flags are kept so
  // that sources only valid with u or v still compile
  return (
    (new RegExp(`${pattern.source}|`, pattern.flags).exec('')?.length ?? 1) - 1
  );
}

// Parsing a pattern compiles the { regex } form, so every parsed pattern is a
// string or a RegExp. RegExps are recognized with isRegExp rather than
// instanceof, which fails across realms: ESLint structuredClones rule options,
// and under Jest the clone comes from a different realm than the rule
const patternSchema = z
  .union([z.string(), regexObjectSchema, z.custom<RegExp>(isRegExp)], {
    error: (issue) => {
      const input = issue.input;
      return typeof input === 'object' &&
        input !== null &&
        !isRegExp(input) &&
        Object.keys(input).length === 0
        ? SERIALIZED_REGEXP_HINT
        : 'Expected a string, a RegExp, or { regex: string, flags?: string }';
    },
  })
  .transform((pattern, ctx): string | RegExp => {
    if (typeof pattern === 'string') {
      return pattern;
    }
    let regex: RegExp;
    if (isRegExp(pattern)) {
      regex = pattern;
    } else {
      try {
        regex = new RegExp(pattern.regex, pattern.flags);
      } catch (e) {
        ctx.addIssue({
          code: 'custom',
          message: `Invalid regular expression ${JSON.stringify(pattern)}: ${e instanceof Error ? e.message : String(e)}`,
        });
        return z.NEVER;
      }
    }
    // The g and y flags make test() and exec() continue from where the
    // previous match ended, and the same RegExp is reused across files, so the
    // pattern would match some files and not others
    if (regex.global || regex.sticky) {
      ctx.addIssue({
        code: 'custom',
        message: `Regular expression ${String(regex)} can't use the g or y flag: both make a regular expression continue from where its previous match ended, so it would match some files and not others. Remove the flag`,
      });
      return z.NEVER;
    }
    return regex;
  });

const firstPartyEntrySchema = z.strictObject({
  type: z.enum(['first-party']),
  filepath: patternSchema,
  allowed: z.array(patternSchema).optional(),
  denied: z.array(patternSchema).optional(),
  excludeTypeImports: z.boolean().optional(),
  message: z.string().optional(),
});

const thirdPartyEntrySchema = z.strictObject({
  type: z.enum(['third-party', 'built-in']),
  moduleSpecifier: patternSchema,
  allowed: z.array(patternSchema).optional(),
  denied: z.array(patternSchema).optional(),
  excludeTypeImports: z.boolean().optional(),
  message: z.string().optional(),
});

// Discriminated so that an error inside an entry is reported at its own path,
// instead of as one "Invalid input" for the whole entry. The refinement only
// runs on an entry whose patterns all parsed
const entrySchema = z
  .discriminatedUnion('type', [firstPartyEntrySchema, thirdPartyEntrySchema])
  .superRefine((entry, ctx) => {
    // A reference to a capture group that doesn't exist would make its
    // pattern silently never match, so it's an invalid option like any other.
    // Only a first-party entry's filepath has groups to refer to
    const groupCount =
      entry.type === 'first-party' ? countCaptureGroups(entry.filepath) : 0;
    const availableGroups =
      entry.type === 'first-party'
        ? `filepath ${String(entry.filepath)} has ${String(groupCount)} capture group${groupCount === 1 ? '' : 's'}`
        : `${entry.type} entries have no filepath, so there are no capture groups to refer to`;
    for (const key of ['allowed', 'denied'] as const) {
      for (const [index, pattern] of (entry[key] ?? []).entries()) {
        if (typeof pattern === 'string') {
          continue;
        }
        for (const groupNumber of getGroupReferences(pattern.source)) {
          if (groupNumber === 0 || groupNumber > groupCount) {
            ctx.addIssue({
              code: 'custom',
              path: [key, index],
              message: `Invalid capture group reference $${String(groupNumber)} in ${String(pattern)}: ${availableGroups}. References start at $1, and a literal dollar sign is written \\$`,
            });
          }
        }
      }
    }
  });
const schema = z.strictObject({
  rules: z.array(entrySchema),
});

// Substitute the capture groups of the filepath match into an allowed or
// denied pattern. Captured text is escaped so it matches literally, and a group
// that didn't take part in the match becomes the empty string
function replaceMatchesInRegex(
  regex: RegExp,
  matches: Array<string | undefined> | null
) {
  if (!matches) {
    return regex;
  }
  return new RegExp(
    regex.source.replace(
      GROUP_REFERENCE_REGEX,
      (match: string, reference: string | undefined) =>
        reference === undefined
          ? match
          : escapeRegExp(matches[Number(reference) - 1] ?? '')
    ),
    regex.flags
  );
}

// The rule restricts nothing without options, so it has no default: enabling
// it without any is a configuration mistake
export const noRestrictedImports = createRule<
  [options?: z.input<typeof schema>],
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
      // The input side is what hosts validate, before patterns are compiled
      items: [
        schema.toJSONSchema({
          unrepresentable: 'any',
          io: 'input',
        }) as JSONSchema4,
      ],
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
    // The options are validated here rather than relying on the host's
    // validation against meta.schema. The RegExp branch of that schema has to
    // accept anything, so that real RegExp instances pass under ESLint, which
    // means no host can reject a RegExp that was serialized to {} on its way
    // here. ESLint 9 has also been seen running rules whose options fail the
    // schema, so a missing configuration is checked here too
    const [options] = context.options;
    if (!options) {
      exitWithError(
        `Rule ${RULE_NAME} was enabled without options. It needs a \`rules\` array describing which imports to restrict`
      );
    }
    const result = schema.safeParse(options);
    if (!result.success) {
      exitWithError(
        `Invalid options for rule ${RULE_NAME}:\n${z.prettifyError(result.error)}`
      );
    }
    const entries = result.data.rules;

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

    // Normalize string file paths to absolute. Module specifiers are matched
    // as written
    const { packageRootDir } = esmInfo.packageInfo;
    const resolveRelativePath = (pattern: string | RegExp) =>
      typeof pattern === 'string' && !isAbsolute(pattern)
        ? resolve(packageRootDir, pattern)
        : pattern;
    for (const entry of entries) {
      entry.allowed = entry.allowed?.map(resolveRelativePath);
      entry.denied = entry.denied?.map(resolveRelativePath);
      if (entry.type === 'first-party') {
        entry.filepath = resolveRelativePath(entry.filepath);
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
        // Check if this import applies to this entry. A capture group that
        // didn't take part in the match is undefined
        let matches: Array<string | undefined> | null = null;
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
