import { createRule, getESMInfo, getLocFromRange } from '../util.js';

export const noUnusedExports = createRule({
  name: 'no-unused-exports',
  meta: {
    docs: {
      description: 'Ensure exports are imported elsewhere in the package',
    },
    schema: [],
    fixable: undefined,
    type: 'problem',
    messages: {
      noUnusedExports: 'Export "{{name}}" must be imported in another file',
    },
    defaultOptions: [],
  },
  create(context) {
    // .d.ts files are not typically referenced directly, and instead are used
    // to type ambient modules. Sometimes they are used directly though when
    // paired with a neighboring vanilla JS file. Either way, we're making the
    // tradeoff of potentially missing an unused type export for better DX.
    if (context.filename.endsWith('.d.ts')) {
      return {};
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

    // Check each export and reexport to make sure it's being used
    for (const exportEntry of [
      ...fileInfo.exports,
      ...fileInfo.singleReexports,
      ...fileInfo.barrelReexports,
    ]) {
      // If this is an entry point, then it's being imported externally
      if (exportEntry.isEntryPoint || exportEntry.isExternallyImported) {
        continue;
      }

      // If nothing names this export and no namespace object contains it,
      // then it isn't used anywhere
      if (
        exportEntry.importedBy.length === 0 &&
        exportEntry.barrelImportedBy.length === 0
      ) {
        context.report({
          messageId: 'noUnusedExports',
          loc: getLocFromRange(context, exportEntry.reportNodeRange),
          data: {
            name: exportEntry.exportName || '<unnamed>',
          },
        });
      }
    }

    return {};
  },
});
