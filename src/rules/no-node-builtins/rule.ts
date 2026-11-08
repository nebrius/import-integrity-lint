import { createRule, getESMInfo, getLocFromRange } from '../util.js';

export const noNodeBuiltins = createRule({
  name: 'no-node-builtins',
  meta: {
    docs: {
      description: 'Disallows imports of Node.js built-in modules',
    },
    schema: [],
    type: 'problem',
    messages: {
      noNodeBuiltins:
        'Import of Node.js built-in module "{{specifier}}" is not allowed',
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

    for (const importEntry of [
      ...fileInfo.singleImports,
      ...fileInfo.barrelImports,
      ...fileInfo.dynamicImports,
      ...fileInfo.sideEffectImports,
      ...fileInfo.singleReexports,
      ...fileInfo.barrelReexports,
    ]) {
      if (importEntry.resolvedModuleType === 'builtin') {
        context.report({
          loc: getLocFromRange(context, importEntry.statementNodeRange),
          messageId: 'noNodeBuiltins',
          data: {
            specifier: importEntry.moduleSpecifier,
          },
        });
      }
    }

    return {};
  },
});
