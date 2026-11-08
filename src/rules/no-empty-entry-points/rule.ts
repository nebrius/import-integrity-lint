import { createRule, getESMInfo } from '../util.js';

export const noEmptyEntryPoints = createRule({
  name: 'no-empty-entry-points',
  meta: {
    docs: {
      description:
        'Flags entry points and externally imported files with no exports',
    },
    schema: [],
    type: 'problem',
    messages: {
      noEmptyEntryPoints: 'Entry point file "{{filePath}}" has no exports',
      noEmptyExternallyImportedFiles:
        'Externally imported file "{{filePath}}" has no exports',
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

    // Bail if this isn't an entry point or externally imported file
    if (!fileInfo.isExternallyImported && !fileInfo.entryPointSpecifier) {
      return {};
    }

    // Ignore config files, since they're added by default
    if (context.filename.includes('.config.')) {
      return {};
    }

    return {
      Program: (node) => {
        // Check if there are no exports, barrel reexports, or single reexports
        if (
          fileInfo.exports.length === 0 &&
          fileInfo.barrelReexports.length === 0 &&
          fileInfo.singleReexports.length === 0
        ) {
          context.report({
            loc: node.loc,
            messageId: fileInfo.isExternallyImported
              ? 'noEmptyExternallyImportedFiles'
              : 'noEmptyEntryPoints',
            data: {
              filePath: context.filename,
            },
          });
        }
      },
    };
  },
});
