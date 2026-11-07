import type { TSESTree } from '@typescript-eslint/typescript-estree';

import { exitWithInternalError } from '../../util/error.js';
import { createRule, getESMInfo, getLocFromRange } from '../util.js';

type ImportDeclaration = TSESTree.ImportDeclaration | TSESTree.ImportExpression;
type ReexportDeclaration =
  | TSESTree.ExportNamedDeclarationWithSource
  | TSESTree.ExportAllDeclaration;

export const requireNodePrefix = createRule({
  name: 'require-node-prefix',
  meta: {
    docs: {
      description:
        'Ensures that imports of Node.js modules use the `node:` prefix',
    },
    schema: [],
    fixable: 'code',
    type: 'problem',
    messages: {
      missingNodePrefix:
        'Import of Node.js built-in modules must use the `node:` prefix',
    },
  },
  defaultOptions: [],
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
      const { moduleSpecifier } = importEntry;
      if (
        // A dynamic import with a non-literal specifier can't be a builtin
        moduleSpecifier !== undefined &&
        importEntry.resolvedModuleType === 'builtin' &&
        !moduleSpecifier.startsWith('node:')
      ) {
        const { statementNodeRange } = importEntry;
        context.report({
          loc: getLocFromRange(context, statementNodeRange),
          messageId: 'missingNodePrefix',
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
              sourceNode.source.raw.replace(
                moduleSpecifier,
                `node:${moduleSpecifier}`
              )
            );
          },
        });
      }
    }

    return {};
  },
});
