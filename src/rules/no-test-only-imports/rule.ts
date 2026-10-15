import {
  createRule,
  getESMInfo,
  getLocFromRange,
  isNonTestFile,
} from '../util.js';

export const noTestOnlyImports = createRule({
  name: 'no-test-only-imports',
  meta: {
    docs: {
      description:
        'Flags exports in production code that are only imported by test code',
    },
    schema: [],
    fixable: undefined,
    type: 'problem',
    messages: {
      noTestOnlyImports: 'Export "{{name}}" must be imported by non-test files',
    },
  },
  defaultOptions: [],
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
    if (fileInfo.fileType !== 'code' || !isNonTestFile(context.filename)) {
      return {};
    }

    // Check each export and reexport to make sure it's being used
    for (const exportEntry of [
      ...fileInfo.exports,
      ...fileInfo.singleReexports,
      ...fileInfo.barrelReexports,
    ]) {
      // If this is an entry point, then it's being imported externally by definition
      if (exportEntry.isEntryPoint || exportEntry.isExternallyImported) {
        continue;
      }

      // Check if there are no imports at all and bail, since this means it's
      // by definition not imported by a test file. Otherwise, it trips our
      // logic below
      if (exportEntry.importedBy.length === 0) {
        continue;
      }

      if (
        !exportEntry.importedBy.some((i) => isNonTestFile(i.filePath)) &&
        !exportEntry.exportName?.startsWith('_testOnly')
      ) {
        if (!(`isTypeExport` in exportEntry) || !exportEntry.isTypeExport) {
          context.report({
            messageId: 'noTestOnlyImports',
            loc: getLocFromRange(context, exportEntry.reportNodeRange),
            data: {
              name: exportEntry.exportName || '<unnamed>',
            },
          });
        }
      }
    }

    return {};
  },
});
