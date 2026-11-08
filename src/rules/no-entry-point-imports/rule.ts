import { createRule, getESMInfo, getLocFromRange } from '../util.js';

export const noEntryPointImports = createRule({
  name: 'no-entry-point-imports',
  meta: {
    docs: {
      description: 'Ensures that exports in entry point files are not imported',
    },
    schema: [],
    fixable: undefined,
    type: 'problem',
    messages: {
      noEntryPointImports: 'Entry point exports should be not imported',
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

    for (const importEntry of fileInfo.singleImports) {
      if (
        importEntry.rootModuleType === 'firstPartyCode' &&
        (importEntry.rootExportEntry.isEntryPoint ||
          importEntry.rootExportEntry.isExternallyImported)
      ) {
        context.report({
          messageId: 'noEntryPointImports',
          loc: getLocFromRange(context, importEntry.reportNodeRange),
        });
      }
    }

    for (const importEntry of [
      ...fileInfo.barrelImports,
      ...fileInfo.sideEffectImports,
    ]) {
      if (!importEntry.resolvedModulePath) {
        continue;
      }
      const fileDetails = packageInfo.files.get(importEntry.resolvedModulePath);
      if (fileDetails?.fileType !== 'code') {
        continue;
      }
      if (fileDetails.entryPointSpecifier || fileDetails.isExternallyImported) {
        context.report({
          messageId: 'noEntryPointImports',
          loc: getLocFromRange(context, importEntry.reportNodeRange),
        });
      }
    }

    return {};
  },
});
