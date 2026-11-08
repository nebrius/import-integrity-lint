import type { JSONSchema4 } from '@typescript-eslint/utils/json-schema';
import { z } from 'zod';

import { createRule, getESMInfo, getLocFromRange } from '../util.js';

const schema = z
  .strictObject({
    ignorePackages: z.array(z.string()).optional(),
  })
  .optional();
type Options = z.infer<typeof schema>;

export const noUnusedPackageExports = createRule<
  [Options],
  'noUnusedPackageExports'
>({
  name: 'no-unused-package-exports',
  meta: {
    docs: {
      description:
        'Ensure entry point exports are imported elsewhere in the monorepo',
    },
    schema: [schema.toJSONSchema() as JSONSchema4],
    fixable: undefined,
    type: 'problem',
    messages: {
      noUnusedPackageExports:
        'Export point export "{{name}}" must be imported in another package',
    },
    defaultOptions: [{ ignorePackages: [] }],
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

    // If this file doesn't have any entry points, then we can bail early and
    // avoid needing to do a more expensive filter.
    if (!fileInfo.entryPointSpecifier) {
      return {};
    }

    // Check if this package is ignored, and if so bail
    const { ignorePackages = [] } = context.options[0] ?? {};
    if (
      packageInfo.packageName &&
      ignorePackages.includes(packageInfo.packageName)
    ) {
      return {};
    }

    // Check each export and reexport to make sure it's being used
    for (const exportEntry of [
      ...fileInfo.exports,
      ...fileInfo.barrelReexports,
      ...fileInfo.singleReexports,
    ]) {
      // Barrel reexports that don't have a name aren't really resolvable (and
      // are disallowed by lint rule anyways), so they're ignored here
      if (!exportEntry.exportName) {
        continue;
      }
      if (exportEntry.externallyImportedBy.length === 0) {
        context.report({
          messageId: 'noUnusedPackageExports',
          loc: getLocFromRange(context, exportEntry.reportNodeRange),
          data: {
            name: exportEntry.exportName,
          },
        });
      }
    }

    return {};
  },
});
