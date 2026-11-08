import type {
  AnalyzedBarrelImport,
  AnalyzedBarrelReexport,
  AnalyzedDynamicImport,
  AnalyzedSideEffectImport,
  AnalyzedSingleImport,
  AnalyzedSingleReexport,
} from '../../types/analyzed.js';
import { exitWithInternalError } from '../../util/error.js';
import { isPathWithinDir } from '../../util/files.js';
import { createRule, getESMInfo, getLocFromRange } from '../util.js';

// Every statement that carries a module specifier
type Statement =
  | AnalyzedSingleImport
  | AnalyzedBarrelImport
  | AnalyzedDynamicImport
  | AnalyzedSideEffectImport
  | AnalyzedSingleReexport
  | AnalyzedBarrelReexport;

export const noUnresolvedImports = createRule({
  name: 'no-unresolved-imports',
  meta: {
    docs: {
      description: 'Ensures that imports point to valid exports',
    },
    schema: [],
    fixable: undefined,
    type: 'problem',
    messages: {
      noUnresolvedImports:
        'Import "{{name}}" does not point to a valid first party export',
      noTransientDependencies:
        'Third party module specifier "{{specifier}}" is not listed in package.json.',
      emptyModuleSpecifier: 'Module specifier is empty',
    },
    defaultOptions: [],
  },
  create(context) {
    const esmInfo = getESMInfo(context);

    // No package info means this file wasn't found as part of the package, e.g.
    // because it's ignored
    /* istanbul ignore if */
    if (!esmInfo) {
      return {};
    }

    const { fileInfo, packageInfo } = esmInfo;
    /* istanbul ignore if */
    if (fileInfo.fileType !== 'code') {
      return {};
    }

    // Whether a module specifier points at a file at all is deliberately not
    // checked here. TypeScript and bundlers already report that for every
    // statement shape, and this plugin only knows the files it analyzes, so it
    // could not tell a missing file from an ignored one such as build output.
    // The checks below are the ones nothing else does: a third party specifier
    // must be listed in package.json, and a named import or entry point
    // re-export of first party code must land on an export that exists.

    // An empty specifier is what an editor leaves behind after auto-closing
    // the quotes. It resolves as an unknown bare specifier, but calling it a
    // missing package.json entry would send people the wrong way, so it gets
    // its own message and no further checks.
    function reportEmptySpecifier(entry: Statement): boolean {
      if (entry.moduleSpecifier !== '') {
        return false;
      }
      context.report({
        messageId: 'emptyModuleSpecifier',
        loc: getLocFromRange(context, entry.statementNodeRange),
      });
      return true;
    }

    // First check imports
    outer: for (const importEntry of [
      ...fileInfo.singleImports,
      ...fileInfo.barrelImports,
      ...fileInfo.dynamicImports,
      ...fileInfo.sideEffectImports,
    ]) {
      if (reportEmptySpecifier(importEntry)) {
        continue;
      }

      // First, check if this is a third party dependency, and ensure that the dependency is listed
      // in a package.json
      if (importEntry.resolvedModuleType === 'thirdParty') {
        // Check if this is a URL dependency (Deno, k6, etc.)
        if (
          importEntry.moduleSpecifier?.startsWith('http://') ||
          importEntry.moduleSpecifier?.startsWith('https://')
        ) {
          continue outer;
        }

        // Now check if this dependency is listed in package.json
        for (const [
          path,
          deps,
        ] of packageInfo.availableThirdPartyDependencies) {
          if (
            isPathWithinDir(path, context.filename) &&
            deps.some(
              (dep) =>
                // Check if this is exactly the import specifier, e.g. 'react'
                importEntry.moduleSpecifier === dep ||
                // Check if this is a type import for a dep from DefinitelyTyped
                // just in case someone is only using type imports w/o the
                // implementation package installed. This checks the flag
                // directly instead of calling `isTypeOnly`, because the `in`
                // check also rules out dynamic imports, whose specifier can be
                // undefined.
                ('isTypeImport' in importEntry &&
                  importEntry.isTypeImport &&
                  `@types/${importEntry.moduleSpecifier}` === dep) ||
                // Check if this is reaching into the package, e.g. 'react/path'
                importEntry.moduleSpecifier?.startsWith(dep + '/')
            )
          ) {
            continue outer;
          }
        }

        // Quick sanity check to see if there was a bug
        /* istanbul ignore if */
        if (importEntry.moduleSpecifier?.startsWith('.')) {
          exitWithInternalError(
            `Module specifier ${importEntry.moduleSpecifier} was misclassified as a third party import`
          );
        }

        // If we got here, we couldn't find a match in package.json, so error
        context.report({
          messageId: 'noTransientDependencies',
          loc: getLocFromRange(context, importEntry.statementNodeRange),
          data: {
            specifier: importEntry.moduleSpecifier,
          },
        });
        continue;
      }

      // Barrel, dynamic, and side effect imports name no symbol: the whole
      // module is bound to one namespace object (or to nothing), and the only
      // way to know whether a member exists is to follow how that object is
      // used at runtime, which isn't tractable. A single import names a symbol,
      // so check that its root export could be resolved.
      if (
        importEntry.resolvedModuleType === 'firstPartyCode' &&
        importEntry.type === 'singleImport' &&
        importEntry.rootModuleType === undefined
      ) {
        context.report({
          loc: getLocFromRange(context, importEntry.reportNodeRange),
          messageId: 'noUnresolvedImports',
          data: {
            name: importEntry.importName,
          },
        });
      }
    }

    // Now check reexports
    for (const reexportEntry of [
      ...fileInfo.singleReexports,
      ...fileInfo.barrelReexports,
    ]) {
      if (reportEmptySpecifier(reexportEntry)) {
        continue;
      }

      // Check if the root export could be resolved, which is only available for
      // single reexports, and only traced when they are entry points
      if (
        reexportEntry.resolvedModuleType === 'firstPartyCode' &&
        reexportEntry.type === 'singleReexport' &&
        reexportEntry.rootModuleType === undefined &&
        (reexportEntry.isEntryPoint || reexportEntry.isExternallyImported)
      ) {
        context.report({
          loc: getLocFromRange(context, reexportEntry.reportNodeRange),
          messageId: 'noUnresolvedImports',
          data: {
            name: reexportEntry.exportName,
          },
        });
      }
    }

    return {};
  },
});
