import type {
  AnalyzedBarrelImport,
  AnalyzedBarrelReexport,
  AnalyzedCodeFileDetails,
  AnalyzedDynamicImport,
  AnalyzedExport,
  AnalyzedOtherFileDetails,
  AnalyzedSideEffectImport,
  AnalyzedSingleImport,
  AnalyzedSingleReexport,
} from '../types/analyzed.js';
import type {
  BaseBarrelImport,
  BaseBarrelReexport,
  BaseCodeFileDetails,
  BaseDynamicImport,
  BaseExport,
  BaseOtherFileDetails,
  BaseSideEffectImport,
  BaseSingleImport,
  BaseSingleReexport,
} from '../types/base.js';
import type {
  ResolvedBarrelImport,
  ResolvedBarrelReexport,
  ResolvedCodeFileDetails,
  ResolvedDynamicImport,
  ResolvedExport,
  ResolvedOtherFileDetails,
  ResolvedSideEffectImport,
  ResolvedSingleImport,
  ResolvedSingleReexport,
} from '../types/resolved.js';

type StrippedFileDetails<
  OtherFileDetails extends BaseOtherFileDetails,
  CodeFileDetails extends BaseCodeFileDetails,
  SingleImport extends BaseSingleImport,
  BarrelImport extends BaseBarrelImport,
  DynamicImport extends BaseDynamicImport,
  SideEffectImport extends BaseSideEffectImport,
  Export extends BaseExport,
  SingleReexport extends BaseSingleReexport,
  BarrelReexport extends BaseBarrelReexport,
> =
  | OtherFileDetails
  | (Omit<
      CodeFileDetails,
      | 'singleImports'
      | 'barrelImports'
      | 'dynamicImports'
      | 'sideEffectImports'
      | 'exports'
      | 'singleReexports'
      | 'barrelReexports'
      | 'lastUpdatedAt'
    > & {
      singleImports: Array<
        Omit<SingleImport, 'statementNodeRange' | 'reportNodeRange'>
      >;
      barrelImports: Array<
        Omit<BarrelImport, 'statementNodeRange' | 'reportNodeRange'>
      >;
      dynamicImports: Array<
        Omit<DynamicImport, 'statementNodeRange' | 'reportNodeRange'>
      >;
      sideEffectImports: Array<
        Omit<SideEffectImport, 'statementNodeRange' | 'reportNodeRange'>
      >;
      exports: Array<Omit<Export, 'statementNodeRange' | 'reportNodeRange'>>;
      singleReexports: Array<
        Omit<SingleReexport, 'statementNodeRange' | 'reportNodeRange'>
      >;
      barrelReexports: Array<
        Omit<BarrelReexport, 'statementNodeRange' | 'reportNodeRange'>
      >;
    });

export type StrippedBaseFileDetails = StrippedFileDetails<
  BaseOtherFileDetails,
  BaseCodeFileDetails,
  BaseSingleImport,
  BaseBarrelImport,
  BaseDynamicImport,
  BaseSideEffectImport,
  BaseExport,
  BaseSingleReexport,
  BaseBarrelReexport
>;

export type StrippedResolvedFileDetails = StrippedFileDetails<
  ResolvedOtherFileDetails,
  ResolvedCodeFileDetails,
  ResolvedSingleImport,
  ResolvedBarrelImport,
  ResolvedDynamicImport,
  ResolvedSideEffectImport,
  ResolvedExport,
  ResolvedSingleReexport,
  ResolvedBarrelReexport
>;

// An "origin" is the import/reexport entry recorded in an export's
// importedBy, barrelImportedBy, or externallyImportedBy list.
// toMatchAnalyzedSpec strips every origin down to a shallow object (no ranges,
// no rootExportEntry, no lists of its own) so that expectations stay one level
// deep and never recurse back through the import graph. These types are the
// expectation-side mirror of that stripping, so the matcher and the types
// always agree on what an origin contains.
type StrippedOrigin<T> = Omit<
  T,
  | 'statementNodeRange'
  | 'reportNodeRange'
  | 'rootExportEntry'
  | 'importedBy'
  | 'barrelImportedBy'
  | 'externallyImportedBy'
>;
type StrippedSingleOrigin =
  | StrippedOrigin<AnalyzedSingleImport>
  | StrippedOrigin<AnalyzedSingleReexport>;
type StrippedAnyOrigin =
  | StrippedSingleOrigin
  | StrippedOrigin<AnalyzedBarrelImport>
  | StrippedOrigin<AnalyzedBarrelReexport>
  | StrippedOrigin<AnalyzedDynamicImport>;

type StrippedAnalyzedExport = Omit<
  AnalyzedExport,
  | 'statementNodeRange'
  | 'reportNodeRange'
  | 'importedBy'
  | 'barrelImportedBy'
  | 'externallyImportedBy'
>;
type StrippedAnalyzedBarrelReexport = Omit<
  AnalyzedBarrelReexport,
  | 'statementNodeRange'
  | 'reportNodeRange'
  | 'importedBy'
  | 'barrelImportedBy'
  | 'externallyImportedBy'
>;

// importedBy origins are always single imports or entry-point single reexports
// (the only statements that name a specific export); the other two lists can
// hold any import/reexport kind.
type StrippedImportedBy = Array<{
  filePath: string;
  importEntry: StrippedSingleOrigin;
}>;
type StrippedBarrelImportedBy = Array<{
  filePath: string;
  importEntry: StrippedAnyOrigin;
}>;
type StrippedExternallyImportedBy = Array<{
  packageRootDir: string;
  filePath: string;
  importEntry: StrippedAnyOrigin;
}>;

export type StrippedAnalyzedFileDetails = StrippedFileDetails<
  AnalyzedOtherFileDetails,
  AnalyzedCodeFileDetails,
  Omit<AnalyzedSingleImport, 'rootExportEntry'> & {
    rootExportEntry?: StrippedAnalyzedExport | StrippedAnalyzedBarrelReexport;
  },
  AnalyzedBarrelImport,
  AnalyzedDynamicImport,
  AnalyzedSideEffectImport,
  Omit<
    AnalyzedExport,
    'importedBy' | 'barrelImportedBy' | 'externallyImportedBy'
  > & {
    importedBy?: StrippedImportedBy;
    barrelImportedBy?: StrippedBarrelImportedBy;
    externallyImportedBy?: StrippedExternallyImportedBy;
  },
  Omit<
    AnalyzedSingleReexport,
    | 'rootExportEntry'
    | 'importedBy'
    | 'barrelImportedBy'
    | 'externallyImportedBy'
  > & {
    importedBy?: StrippedImportedBy;
    barrelImportedBy?: StrippedBarrelImportedBy;
    externallyImportedBy?: StrippedExternallyImportedBy;
    rootExportEntry?: StrippedAnalyzedExport | StrippedAnalyzedBarrelReexport;
  },
  Omit<
    AnalyzedBarrelReexport,
    | 'rootExportEntry'
    | 'importedBy'
    | 'barrelImportedBy'
    | 'externallyImportedBy'
  > & {
    rootExportEntry?: StrippedAnalyzedExport | StrippedAnalyzedBarrelReexport;
    importedBy?: StrippedImportedBy;
    barrelImportedBy?: StrippedBarrelImportedBy;
    externallyImportedBy?: StrippedExternallyImportedBy;
  }
>;
