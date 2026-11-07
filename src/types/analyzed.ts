import type {
  ResolvedBarrelImport,
  ResolvedBarrelReexport,
  ResolvedCodeFileDetails,
  ResolvedDynamicImport,
  ResolvedExport,
  ResolvedOtherFileDetails,
  ResolvedPackageInfo,
  ResolvedSideEffectImport,
  ResolvedSingleImport,
  ResolvedSingleReexport,
} from './resolved.js';

type AnalyzedImportBase =
  | {
      /**
       * A rootModuleType of `undefined` indicates that either:
       * 1. The statement is a reexport statement that is not an entry point,
       * 2. The root export could not be resolved
       */
      rootModuleType: undefined;

      // Similar to the resolved equivalent, we have to add this to narrow down
      // types properly in test code
      rootModulePath?: undefined;
      rootExportEntry?: undefined;
    }
  | {
      rootModuleType: 'builtin';

      // Similar to the resolved equivalent, we have to add this to narrow down
      // types properly in test code
      rootModulePath?: undefined;
      rootExportEntry?: undefined;
    }
  | {
      rootModuleType: 'thirdParty';

      // Similar to the resolved equivalent, we have to add this to narrow down
      // types properly in test code
      rootModulePath?: undefined;
      rootExportEntry?: undefined;
    }
  | {
      rootModuleType: 'firstPartyOther';

      /**
       * The absolute path of the root file with the export that the
       * import/reexport statement ultimately resolves to. In other words, if we
       * have:
       *
       * ```
       * // foo.ts
       * import { baz } from './bar'
       *
       * // bar.ts
       * export { baz } from './baz'
       *
       * // baz.ts
       * export const baz = 10;
       * ```
       *
       * then `rootModulePath` in `foo.ts` is `/path/to/baz.ts`. Contrast this
       * with `resolvedModulePath` which equals `/path/to/bar.ts`.
       *
       * Note: value is `undefined` when the last reexport in the chain points
       * at a module specifier that can't be resolved, same as
       * `resolvedModulePath` on that reexport. The plugin only knows the files
       * it analyzes, so the target may be an ignored file such as build
       * output rather than a missing one.
       */
      rootModulePath: string | undefined;

      // Similar to the resolved equivalent, we have to add this to narrow down
      // types properly in test code
      rootExportEntry?: undefined;
    }
  | {
      rootModuleType: 'firstPartyCode';

      /**
       * The absolute path of the root file with the export that the
       * import/reexport statement ultimately resolves to. In other words, if we
       * have:
       *
       * ```
       * // foo.ts
       * import { baz } from './bar'
       *
       * // bar.ts
       * export { baz } from './baz'
       *
       * // baz.ts
       * export const baz = 10;
       * ```
       *
       * then `rootModulePath` in `foo.ts` is `/path/to/baz.ts`. Contrast this
       * with `resolvedModulePath` which equals `/path/to/bar.ts`.
       */
      rootModulePath: string;

      /**
       * The root export entry that this import/reexport statement ultimately
       * resolves to.
       *
       * Most of the time this is an export statement, but on occasion it can
       * be a named barrel reexportin the middle of the reexport chain.
       *
       * Consider this code:
       *
       * ```
       * // foo.ts
       * import { baz } from './bar'
       *
       * // bar.ts
       * export * as baz from './baz'
       * ```
       *
       * In this case, there is a named export we found, but we can't go any
       * further because there is nothing named, or singular, past this point
       */
      rootExportEntry: AnalyzedExport | AnalyzedBarrelReexport;
    };

type AnalyzedExportBase = {
  /**
   * The single imports whose by-name resolution ends at or passes through this
   * entry. An export is listed when an import names it, directly or through a
   * chain of named reexports; a named reexport is listed when it is a link in
   * that chain; a bare `export *` is listed when it is the statement that
   * supplied the name. When no code the plugin can see supplies the name,
   * every bare `export *` of a first party module the plugin can't look
   * inside is listed, since any of them may.
   *
   * This also includes reexports that are entry points, since they are acting
   * like an import for the purposes of this plugin
   */
  importedBy: Array<{
    filePath: string;
    importEntry: AnalyzedSingleImport | AnalyzedSingleReexport;
  }>;

  // Note: this data is not computed until phase 4
  /**
   * A list of files and import entries that imports this export from another
   * package in the same monorepo.
   *
   * This computation is not as in-depth as `importedBy` because it does not
   * follow reexports in the consuming package. If another package reexports
   * this export, then it is immediately considered an external import and added
   * to this list, instead of tracing through the reexport chain.
   *
   * This list is an empty array of monorepoRootDir is not set by the user.
   */
  externallyImportedBy: Array<{
    packageRootDir: string;
    filePath: string;
    importEntry:
      | AnalyzedSingleImport
      | AnalyzedSingleReexport
      | AnalyzedBarrelImport
      | AnalyzedBarrelReexport
      | AnalyzedDynamicImport;
  }>;

  /**
   * Every import whose namespace object contains this entry: `import * as`,
   * `import()`, an entry-point `export *` / `export * as`, or a single import
   * that resolves to an `export * as` namespace. Namespace membership is
   * followed precisely: a single reexport inside a namespace contributes only
   * the export it names, a nested `export * as` contributes its whole
   * namespace, and a bare `export *` never forwards `default`. Reexport
   * statements inside the namespace are members too and are recorded here.
   *
   * This also includes reexports that are entry points, since they are acting
   * like an import for the purposes of this plugin
   *
   * Note: unlike `importedBy`, entries here do not actually guarantee this
   * export is actually used, since the code holding the namespace object may
   * never touch it
   */
  barrelImportedBy: Array<{
    filePath: string;
    importEntry:
      | AnalyzedBarrelReexport
      | AnalyzedSingleImport
      | AnalyzedSingleReexport
      | AnalyzedBarrelImport
      | AnalyzedDynamicImport;
  }>;
};

/* Imports */

// Note: barrel and dynamic imports can't be resolved to a single file, since
// they bundle up multiple exports that could resolve to different files
export type AnalyzedSingleImport = ResolvedSingleImport & AnalyzedImportBase;
export type AnalyzedBarrelImport = ResolvedBarrelImport;
export type AnalyzedDynamicImport = ResolvedDynamicImport;
export type AnalyzedSideEffectImport = ResolvedSideEffectImport;

/* Exports */

export type AnalyzedExport = ResolvedExport & AnalyzedExportBase;

/* Reexports */

export type AnalyzedSingleReexport = ResolvedSingleReexport &
  AnalyzedImportBase &
  AnalyzedExportBase;
export type AnalyzedBarrelReexport = ResolvedBarrelReexport &
  AnalyzedExportBase;

/* File Details */

export type AnalyzedOtherFileDetails = ResolvedOtherFileDetails;

export type AnalyzedCodeFileDetails = Omit<
  ResolvedCodeFileDetails,
  | 'exports'
  | 'singleImports'
  | 'barrelImports'
  | 'dynamicImports'
  | 'singleReexports'
  | 'barrelReexports'
> & {
  exports: AnalyzedExport[];
  singleImports: AnalyzedSingleImport[];
  barrelImports: AnalyzedBarrelImport[];
  dynamicImports: AnalyzedDynamicImport[];
  sideEffectImports: AnalyzedSideEffectImport[];
  singleReexports: AnalyzedSingleReexport[];
  barrelReexports: AnalyzedBarrelReexport[];
};

type AnalyzedFileDetails = AnalyzedOtherFileDetails | AnalyzedCodeFileDetails;

export type AnalyzedPackageInfo = Omit<ResolvedPackageInfo, 'files'> & {
  /**
   * Mapping of _absolute_ file paths to file details
   */
  files: Map<string, AnalyzedFileDetails>;

  // Note: this data is not computed until phase 4
  /**
   * The entry point files for this package that maps from import specifer
   * (package name + subpath) to file details for quick lookup
   */
  packageEntryPointExports: Map<string, AnalyzedCodeFileDetails>;
};
