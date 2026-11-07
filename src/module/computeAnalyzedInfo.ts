import type {
  AnalyzedBarrelImport,
  AnalyzedBarrelReexport,
  AnalyzedCodeFileDetails,
  AnalyzedDynamicImport,
  AnalyzedExport,
  AnalyzedPackageInfo,
  AnalyzedSingleImport,
  AnalyzedSingleReexport,
} from '../types/analyzed.js';
import type { ResolvedPackageInfo } from '../types/resolved.js';
import { exitWithInternalError } from '../util/error.js';

export function computeAnalyzedInfo(
  resolvedPackageInfo: ResolvedPackageInfo
): AnalyzedPackageInfo {
  const analyzedPackageInfo: AnalyzedPackageInfo = {
    ...resolvedPackageInfo,
    files: new Map(),
    packageEntryPointExports: new Map(),
  };

  // First we initialize each detail with placeholder data, since we need a
  // completely initialized `analyzedInfo` object available before we can start
  // traversing/populating analyzed info.
  //
  // Note: externallyImportedBy is not initialized in this phase directly
  // because we need the entire package to be fully analyzed before we can
  // populate it. This will happen in the computePackageInfo phase. We define
  // the types as part of the analyzed phase for simplicity, and having a split
  // phase as more of an implementation detail.
  for (const [filePath, fileDetails] of resolvedPackageInfo.files) {
    if (fileDetails.fileType !== 'code') {
      analyzedPackageInfo.files.set(filePath, {
        fileType: 'other',
      });
      continue;
    }

    const analyzedFileInfo: AnalyzedCodeFileDetails = {
      fileType: 'code',
      entryPointSpecifier: fileDetails.entryPointSpecifier,
      isExternallyImported: fileDetails.isExternallyImported,
      lastUpdatedAt: fileDetails.lastUpdatedAt,
      exports: [],
      singleImports: [],
      barrelImports: [],
      dynamicImports: [],
      sideEffectImports: [],
      singleReexports: [],
      barrelReexports: [],
    };
    analyzedPackageInfo.files.set(filePath, analyzedFileInfo);

    for (const exportDetails of fileDetails.exports) {
      analyzedFileInfo.exports.push({
        ...exportDetails,
        importedBy: [],
        barrelImportedBy: [],
        externallyImportedBy: [],
      });
    }

    for (const reexportDetails of fileDetails.singleReexports) {
      analyzedFileInfo.singleReexports.push({
        ...reexportDetails,
        // If this reexport is a builtin or thirdparty reexport, we know
        // what the root module type is. However, if it's first party then
        // we don't know what the type is yet. In this case, once we
        // determine the type we'll change this value and potentially fill
        // in other details
        rootModuleType:
          reexportDetails.resolvedModuleType === 'builtin' ||
          reexportDetails.resolvedModuleType === 'thirdParty'
            ? reexportDetails.resolvedModuleType
            : undefined,
        importedBy: [],
        barrelImportedBy: [],
        externallyImportedBy: [],
      });
    }

    for (const reexportDetails of fileDetails.barrelReexports) {
      analyzedFileInfo.barrelReexports.push({
        ...reexportDetails,
        importedBy: [],
        barrelImportedBy: [],
        externallyImportedBy: [],
      });
    }

    for (const importDetails of fileDetails.singleImports) {
      analyzedFileInfo.singleImports.push({
        ...importDetails,
        // If this import is a builtin or thirdParty import, we know what
        // the root module type is. Otherwise, once we determine the type
        // during traversal we'll change this value and potentially fill
        // in other details.
        rootModuleType:
          importDetails.resolvedModuleType === 'builtin' ||
          importDetails.resolvedModuleType === 'thirdParty'
            ? importDetails.resolvedModuleType
            : undefined,
      });
    }

    for (const importDetails of fileDetails.barrelImports) {
      analyzedFileInfo.barrelImports.push({
        ...importDetails,
      });
    }

    for (const importDetails of fileDetails.dynamicImports) {
      analyzedFileInfo.dynamicImports.push({
        ...importDetails,
      });
    }

    for (const importDetails of fileDetails.sideEffectImports) {
      analyzedFileInfo.sideEffectImports.push({
        ...importDetails,
      });
    }
  }

  // Now that we have placeholder values for each entry, we're ready to
  // analyze/traverse the tree. The name index is shared by every traversal in
  // this run and is filled in lazily, one file at a time, by `lookupName`.
  const nameIndex: NameIndex = new Map();
  for (const [filePath, fileDetails] of analyzedPackageInfo.files) {
    // Nothing to do if this isn't a code file
    if (fileDetails.fileType !== 'code') {
      continue;
    }

    // First, analyze all imports
    // Note: we don't analyze side effect imports, since there is no imported
    // symbol to correlate to an export
    for (const importEntry of fileDetails.singleImports) {
      analyzeOrigin(
        { type: 'single', filePath, importEntry },
        analyzedPackageInfo,
        nameIndex
      );
    }
    for (const importEntry of fileDetails.barrelImports) {
      analyzeOrigin(
        { type: 'barrel', filePath, importEntry },
        analyzedPackageInfo,
        nameIndex
      );
    }
    for (const importEntry of fileDetails.dynamicImports) {
      analyzeOrigin(
        { type: 'barrel', filePath, importEntry },
        analyzedPackageInfo,
        nameIndex
      );
    }

    // Now, treat reexports that are also entry points as an import, so that we
    // can mark the relevant exports they point to as being imported too (since
    // in reality they are)
    for (const reexportEntry of fileDetails.singleReexports) {
      if (!reexportEntry.isEntryPoint && !reexportEntry.isExternallyImported) {
        continue;
      }
      analyzeOrigin(
        { type: 'single', filePath, importEntry: reexportEntry },
        analyzedPackageInfo,
        nameIndex
      );
    }
    for (const reexportEntry of fileDetails.barrelReexports) {
      if (!reexportEntry.isEntryPoint && !reexportEntry.isExternallyImported) {
        continue;
      }
      analyzeOrigin(
        { type: 'barrel', filePath, importEntry: reexportEntry },
        analyzedPackageInfo,
        nameIndex
      );
    }
  }

  // Populate the list of package entry point exports
  for (const [, fileDetails] of analyzedPackageInfo.files) {
    if (fileDetails.fileType !== 'code' || !fileDetails.entryPointSpecifier) {
      continue;
    }
    analyzedPackageInfo.packageEntryPointExports.set(
      fileDetails.entryPointSpecifier,
      fileDetails
    );
  }

  return analyzedPackageInfo;
}

/**
 * The import or reexport statement whose reachability is being traced. A
 * "single" origin names one export (`import { a } from`, or an entry-point
 * `export { a } from`). A "barrel" origin yields a whole namespace object
 * (`import * as`, `import()`, or an entry-point `export *` / `export * as`).
 */
type SingleOrigin = {
  type: 'single';
  filePath: string;
  importEntry: AnalyzedSingleImport | AnalyzedSingleReexport;
};
type BarrelOrigin = {
  type: 'barrel';
  filePath: string;
  importEntry:
    | AnalyzedBarrelImport
    | AnalyzedDynamicImport
    | AnalyzedBarrelReexport;
};
type Origin = SingleOrigin | BarrelOrigin;

/**
 * How an entry was reached from the origin. `single` means the origin names
 * this entry, directly or through a chain of named reexports, and the entry is
 * recorded in `importedBy`. `barrel` means the entry is a member of a
 * namespace object the origin yields, and it is recorded in
 * `barrelImportedBy`. Once a traversal passes through a namespace it stays
 * `barrel`, even when the origin itself is a single import.
 */
type Via = 'single' | 'barrel';

/** Any entry that carries `importedBy` / `barrelImportedBy` lists. */
type Reachable =
  | AnalyzedExport
  | AnalyzedSingleReexport
  | AnalyzedBarrelReexport;

/**
 * Per-file lookup from export name to the entry that supplies it, filled in
 * lazily once per phase-3 run. Only `resolveName` consults it, so origins that
 * never resolve a name (e.g. `import * as` of a module with no reexports)
 * never pay for building it.
 */
type NameIndex = Map<AnalyzedCodeFileDetails, Map<string, Reachable>>;

/**
 * Everything one top-level traversal needs. The name index is shared by every
 * traversal in the run; the origin and the namespace-visited map belong to
 * this traversal only.
 */
type Context = {
  origin: Origin;
  analyzedPackageInfo: AnalyzedPackageInfo;
  nameIndex: NameIndex;
  /**
   * Files whose namespace has already been marked for this origin, mapped to
   * whether that pass included the `default` export. See `markNamespace`.
   */
  namespaceVisited: Map<string, boolean>;
};

/** What a by-name resolution ends at, written onto a single origin. */
type RootInfo =
  | { rootModuleType: 'builtin' | 'thirdParty' }
  | { rootModuleType: 'firstPartyOther'; rootModulePath: string | undefined }
  | {
      rootModuleType: 'firstPartyCode';
      rootModulePath: string;
      rootExportEntry: AnalyzedExport | AnalyzedBarrelReexport;
    };

/**
 * Runs one origin to completion: a single origin resolves the one name it
 * imports, a barrel origin marks the whole namespace it yields. An origin that
 * doesn't point at first party code has nothing to reach.
 */
function analyzeOrigin(
  origin: Origin,
  analyzedPackageInfo: AnalyzedPackageInfo,
  nameIndex: NameIndex
) {
  if (origin.importEntry.resolvedModuleType !== 'firstPartyCode') {
    return;
  }
  const ctx: Context = {
    origin,
    analyzedPackageInfo,
    nameIndex,
    namespaceVisited: new Map(),
  };
  if (origin.type === 'single') {
    // Only a single origin has a root, and this is the one place it is written
    const root = resolveName(
      ctx,
      origin.importEntry.resolvedModulePath,
      origin.importEntry.importName,
      'single'
    );
    if (root) {
      Object.assign(origin.importEntry, root);
    }
  } else {
    markNamespace(
      ctx,
      origin.importEntry.resolvedModulePath,
      namespaceIncludesDefault(origin.importEntry)
    );
  }
}

/**
 * Whether the namespace object a statement yields has a `default` member. A
 * bare `export *` is the one namespace source that never forwards `default`;
 * `import * as`, `import()`, and `export * as` all include it.
 */
function namespaceIncludesDefault(entry: BarrelOrigin['importEntry']) {
  return entry.type !== 'barrelReexport' || entry.exportName !== undefined;
}

function getCodeFileDetails(
  ctx: Context,
  filePath: string
): AnalyzedCodeFileDetails {
  const fileDetails = ctx.analyzedPackageInfo.files.get(filePath);

  /* istanbul ignore if */
  if (!fileDetails) {
    exitWithInternalError(`File ${filePath} is missing in package info`, {
      filePath: ctx.origin.filePath,
      range: ctx.origin.importEntry.statementNodeRange,
    });
  }

  // Shouldn't happen in practice, but check anyways to make TypeScript happy,
  // plus "shouldn't happen" has a funny way of coming true sometimes
  /* istanbul ignore if */
  if (fileDetails.fileType !== 'code') {
    exitWithInternalError(
      `moduleType on consumer of ${filePath} is "code", but file type is "${fileDetails.fileType}"`,
      {
        filePath: ctx.origin.filePath,
        range: ctx.origin.importEntry.statementNodeRange,
      }
    );
  }

  return fileDetails;
}

function lookupName(
  ctx: Context,
  fileDetails: AnalyzedCodeFileDetails,
  name: string
): Reachable | undefined {
  let names = ctx.nameIndex.get(fileDetails);
  if (!names) {
    names = new Map();
    // A module's own exports take precedence over what it reexports, and a
    // named reexport over an `export *`. Duplicate export names across these
    // are a SyntaxError, so first-wins only ever matters for invalid modules.
    for (const entry of fileDetails.exports) {
      if (!names.has(entry.exportName)) {
        names.set(entry.exportName, entry);
      }
    }
    for (const entry of fileDetails.singleReexports) {
      if (!names.has(entry.exportName)) {
        names.set(entry.exportName, entry);
      }
    }
    for (const entry of fileDetails.barrelReexports) {
      if (entry.exportName !== undefined && !names.has(entry.exportName)) {
        names.set(entry.exportName, entry);
      }
    }
    ctx.nameIndex.set(fileDetails, names);
  }
  return names.get(name);
}

/**
 * Records that the origin reaches `entry`, in the list that `via` selects.
 *
 * Phase 3 runs one origin to completion before starting the next, so every
 * push for an origin into any one list is contiguous. That is the only reason
 * checking the last element is an exact dedupe. If traversal order ever
 * interleaves origins, this has to become a per-origin set instead.
 */
function markImported(ctx: Context, entry: Reachable, via: Via) {
  const { origin } = ctx;
  if (via === 'single') {
    /* istanbul ignore if */
    if (origin.type !== 'single') {
      exitWithInternalError(
        'Attempted to record a by-name import from a namespace origin',
        {
          filePath: origin.filePath,
          range: origin.importEntry.statementNodeRange,
        }
      );
    }
    if (entry.importedBy.at(-1)?.importEntry === origin.importEntry) {
      return;
    }
    entry.importedBy.push({
      filePath: origin.filePath,
      importEntry: origin.importEntry,
    });
  } else {
    if (entry.barrelImportedBy.at(-1)?.importEntry === origin.importEntry) {
      return;
    }
    entry.barrelImportedBy.push({
      filePath: origin.filePath,
      importEntry: origin.importEntry,
    });
  }
}

/**
 * Finds what `name`, imported from `file`, refers to, recording every entry
 * the lookup passes through as reached by the origin. Returns what the name
 * ultimately resolves to, or `undefined` if it wasn't found.
 *
 * Code the plugin can see always wins. Only when it supplies nothing does a
 * second search let a bare `export *` of a module the plugin can't look
 * inside count as supplying the name. A single search can't do this: it is
 * depth-first, so trusting such an `export *` found under the first branch
 * would end it before a later branch that does supply the name was tried.
 */
function resolveName(
  ctx: Context,
  file: string,
  name: string,
  via: Via
): RootInfo | undefined {
  return (
    searchName(ctx, file, name, { via, visited: new Set(), opaque: false }) ??
    searchName(ctx, file, name, { via, visited: new Set(), opaque: true })
  );
}

/** One of `resolveName`'s searches. */
type NameSearch = {
  via: Via;
  visited: Set<string>;
  /**
   * Whether a bare `export *` of a first party module the plugin can't look
   * inside may supply the name
   */
  opaque: boolean;
};

function searchName(
  ctx: Context,
  currentFile: string,
  name: string,
  search: NameSearch
): RootInfo | undefined {
  const { via, visited } = search;
  // Keyed by file *and* name. A renaming reexport can legitimately bring the
  // search back to a file that was already probed under a different name:
  // `export * from './impl'` beside `export * from './rename'`, where rename
  // is `export { a as b } from './impl'`, probes impl for `b` and then again
  // for `a`. Keying by file alone refused that second visit and left the
  // import unresolved. The state space is finite, so cycles still terminate.
  const visitKey = `${currentFile}\0${name}`;
  if (visited.has(visitKey)) {
    return undefined;
  }
  visited.add(visitKey);
  const fileDetails = getCodeFileDetails(ctx, currentFile);

  const hit = lookupName(ctx, fileDetails, name);
  if (hit) {
    switch (hit.type) {
      // We found the root export
      case 'export': {
        markImported(ctx, hit, via);
        return {
          rootModuleType: 'firstPartyCode',
          rootModulePath: currentFile,
          rootExportEntry: hit,
        };
      }

      // A named reexport: follow it by name. The reexport statement itself is
      // reached whatever its target turns out to be.
      case 'singleReexport': {
        markImported(ctx, hit, via);
        if (hit.resolvedModuleType !== 'firstPartyCode') {
          return resolveNonCodeTarget(hit);
        }
        const root = searchName(
          ctx,
          hit.resolvedModulePath,
          hit.importName,
          search
        );
        if (root) {
          return root;
        }
        // The chain is broken somewhere past this reexport. Keep looking
        // through this file's `export *` statements before giving up. This is
        // deliberately lenient: a module whose named reexport is broken fails
        // to link, which TypeScript and bundlers report, so only invalid
        // modules get here.
        break;
      }

      // A named barrel reexport (`export * as name`) is as far as a name can be
      // followed: past it lies a namespace object, so everything in it is
      // reached as a namespace member.
      case 'barrelReexport': {
        markImported(ctx, hit, via);
        if (hit.resolvedModuleType !== 'firstPartyCode') {
          return resolveNonCodeTarget(hit);
        }
        markNamespace(
          ctx,
          hit.resolvedModulePath,
          namespaceIncludesDefault(hit)
        );
        return {
          rootModuleType: 'firstPartyCode',
          rootModulePath: currentFile,
          rootExportEntry: hit,
        };
      }
    }
  }

  // No named entry supplies `name`, so it can only come through a bare
  // `export *`. Those never forward `default`, and we don't know what they
  // contain, so search each one depth-first. The statement that turns out to
  // supply the name is itself reached.
  if (name === 'default') {
    return undefined;
  }
  for (const reexportEntry of fileDetails.barrelReexports) {
    // Technically speaking, it's possible for the root export to exist behind
    // a non-first-party `export *` if, say, someone did something stupid like
    // `import { join } from './foo'` coupled with `export * from 'node:path'`.
    // That's really bad coding though so we're not going to support it here,
    // and `no-external-barrel-reexports` reports it. First party modules the
    // plugin can't look inside are handled by the opaque search below.
    if (
      reexportEntry.exportName !== undefined ||
      reexportEntry.resolvedModuleType !== 'firstPartyCode'
    ) {
      continue;
    }
    const root = searchName(
      ctx,
      reexportEntry.resolvedModulePath,
      name,
      search
    );
    if (root) {
      markImported(ctx, reexportEntry, via);
      return root;
    }
  }

  // In the opaque search, a bare `export *` of a first party module the
  // plugin can't look inside (a file it doesn't analyze, or a non-code file)
  // may supply the name. Any of them could, so each one is reached, and the
  // name resolves to the first.
  if (!search.opaque) {
    return undefined;
  }
  let root: RootInfo | undefined;
  for (const reexportEntry of fileDetails.barrelReexports) {
    if (
      reexportEntry.exportName === undefined &&
      reexportEntry.resolvedModuleType === 'firstPartyOther'
    ) {
      markImported(ctx, reexportEntry, via);
      root ??= resolveNonCodeTarget(reexportEntry);
    }
  }
  return root;
}

/** A reexport whose target is anything but first party code. */
type NonCodeReexport = Exclude<
  AnalyzedSingleReexport | AnalyzedBarrelReexport,
  { resolvedModuleType: 'firstPartyCode' }
>;

/**
 * Terminal step of a by-name resolution whose target is not first party code.
 * Shared by single reexports, named barrel reexports, and the bare `export *`
 * statements of the opaque search: they are identical here, and keeping one
 * copy is what keeps them from drifting apart.
 */
function resolveNonCodeTarget(hit: NonCodeReexport): RootInfo {
  switch (hit.resolvedModuleType) {
    case 'builtin':
    case 'thirdParty': {
      return { rootModuleType: hit.resolvedModuleType };
    }
    case 'firstPartyOther': {
      // A path of `undefined` means the specifier matched no file the plugin
      // knows. That can be an ignored file such as build output rather than a
      // missing one, so the name counts as resolved, just as an import
      // straight from that specifier goes unchecked.
      return {
        rootModuleType: 'firstPartyOther',
        rootModulePath: hit.resolvedModulePath,
      };
    }
  }
}

/**
 * Records every member of `file`'s namespace object as reached by the origin,
 * following reexports: a single reexport contributes exactly the export it
 * names, a named barrel reexport contributes a whole nested namespace, and a
 * bare `export *` contributes everything except `default`.
 *
 * The visited map is three-state per file: unvisited, visited without
 * `default`, visited with `default`. A revisit that now includes `default`
 * only handles the entries the first pass skipped; everything else was already
 * handled with the correct flags, since the flag for each child is determined
 * by the child statement, not by how the container was reached.
 */
function markNamespace(ctx: Context, file: string, includeDefault: boolean) {
  const previous = ctx.namespaceVisited.get(file);
  if (previous === true || previous === includeDefault) {
    return;
  }
  ctx.namespaceVisited.set(file, includeDefault);
  // On a revisit, only what the first pass skipped is new
  const onlyDefaults = previous === false;
  const fileDetails = getCodeFileDetails(ctx, file);

  const skip = (entry: { exportName: string | undefined }) => {
    const isDefault = entry.exportName === 'default';
    return (!includeDefault && isDefault) || (onlyDefaults && !isDefault);
  };

  for (const entry of fileDetails.exports) {
    if (skip(entry)) {
      continue;
    }
    markImported(ctx, entry, 'barrel');
  }
  for (const entry of fileDetails.singleReexports) {
    if (skip(entry)) {
      continue;
    }
    // Every member of the namespace is reached, whatever module it points to
    markImported(ctx, entry, 'barrel');
    // ...but a single reexport only brings the one export it names into the
    // namespace, so follow it by name rather than marking its whole file
    if (entry.resolvedModuleType === 'firstPartyCode') {
      resolveName(ctx, entry.resolvedModulePath, entry.importName, 'barrel');
    }
  }
  for (const entry of fileDetails.barrelReexports) {
    if (skip(entry)) {
      continue;
    }
    markImported(ctx, entry, 'barrel');
    if (entry.resolvedModuleType === 'firstPartyCode') {
      markNamespace(
        ctx,
        entry.resolvedModulePath,
        namespaceIncludesDefault(entry)
      );
    }
  }
}
