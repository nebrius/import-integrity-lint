import { createRule, getESMInfo, getLocFromRange } from '../util.js';

export const noNamedAsDefault = createRule({
  name: 'no-named-as-default',
  meta: {
    docs: {
      description:
        'Ensures that imports of Node.js modules use the `node:` prefix',
    },
    schema: [],
    fixable: undefined,
    type: 'problem',
    messages: {
      noNamedAsDefault:
        'Default import alias must not have the same name as a named export',
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
    if (fileInfo.fileType !== 'code') {
      return {};
    }

    for (const importEntry of fileInfo.singleImports) {
      if (
        importEntry.importName !== 'default' ||
        !importEntry.resolvedModulePath
      ) {
        continue;
      }
      const fileDetails = esmInfo.packageInfo.files.get(
        importEntry.resolvedModulePath
      );
      /* istanbul ignore if */
      if (!fileDetails || fileDetails.fileType !== 'code') {
        continue;
      }
      for (const exportEntry of [
        ...fileDetails.exports,
        ...fileDetails.singleReexports,
        ...fileDetails.barrelReexports,
      ]) {
        if (exportEntry.exportName === importEntry.importAlias) {
          context.report({
            loc: getLocFromRange(context, importEntry.reportNodeRange),
            messageId: 'noNamedAsDefault',
          });
        }
      }
    }

    for (const importEntry of fileInfo.singleReexports) {
      /* istanbul ignore if */
      if (
        importEntry.importName !== 'default' ||
        !importEntry.resolvedModulePath
      ) {
        continue;
      }
      const fileDetails = esmInfo.packageInfo.files.get(
        importEntry.resolvedModulePath
      );
      /* istanbul ignore if */
      if (!fileDetails || fileDetails.fileType !== 'code') {
        continue;
      }
      for (const exportEntry of [
        ...fileDetails.exports,
        ...fileDetails.singleReexports,
        ...fileDetails.barrelReexports,
      ]) {
        if (exportEntry.exportName === importEntry.exportName) {
          context.report({
            loc: getLocFromRange(context, importEntry.reportNodeRange),
            messageId: 'noNamedAsDefault',
          });
        }
      }
    }

    return {};
  },
});
