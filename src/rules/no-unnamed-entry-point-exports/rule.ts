import { createRule, getESMInfo, getLocFromRange } from '../util.js';

export const noUnnamedEntryPointExports = createRule({
  name: 'no-unnamed-entry-point-exports',
  meta: {
    docs: {
      description: 'Ensures barrel reexports in entry points are named',
    },
    schema: [],
    fixable: undefined,
    type: 'problem',
    messages: {
      noUnnamedEntryPointExports:
        'Barrel reexports in entry points must be named',
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

    const { fileInfo } = esmInfo;
    /* istanbul ignore if */
    if (fileInfo.fileType !== 'code' || !fileInfo.entryPointSpecifier) {
      return {};
    }

    // Now check reexports
    for (const reexportEntry of fileInfo.barrelReexports) {
      if (!reexportEntry.exportName) {
        context.report({
          loc: getLocFromRange(context, reexportEntry.reportNodeRange),
          messageId: 'noUnnamedEntryPointExports',
        });
      }
    }

    return {};
  },
});
