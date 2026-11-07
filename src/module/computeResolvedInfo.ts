import { builtinModules } from 'node:module';
import { basename, dirname, extname, join, resolve } from 'node:path';

import type { BaseCodeFileDetails, BasePackageInfo } from '../types/base.js';
import type {
  Resolved,
  ResolvedCodeFileDetails,
  ResolvedPackageInfo,
} from '../types/resolved.js';
import { isCodeFile } from '../util/code.js';
import { exitWithError, exitWithInternalError } from '../util/error.js';
import {
  getRelativePathFromRoot,
  splitPathIntoSegments,
} from '../util/files.js';

export function computeResolvedInfo(
  basePackageInfo: BasePackageInfo
): ResolvedPackageInfo {
  // Always recompute the folder tree when we're starting from scratch
  computeFolderTree(basePackageInfo);

  const resolvedPackageInfo: ResolvedPackageInfo = {
    ...basePackageInfo,
    files: new Map(),
  };

  for (const [filePath, baseFileDetails] of basePackageInfo.files) {
    if (baseFileDetails.fileType !== 'code') {
      resolvedPackageInfo.files.set(filePath, {
        fileType: 'other',
      });
      continue;
    }
    const resolvedCodeFileDetails: ResolvedCodeFileDetails = {
      fileType: 'code',
      entryPointSpecifier: baseFileDetails.entryPointSpecifier,
      isExternallyImported: baseFileDetails.isExternallyImported,
      lastUpdatedAt: baseFileDetails.lastUpdatedAt,
      exports: [],
      singleImports: [],
      barrelImports: [],
      dynamicImports: [],
      sideEffectImports: [],
      singleReexports: [],
      barrelReexports: [],
    };
    resolvedPackageInfo.files.set(filePath, resolvedCodeFileDetails);
    populateFileDetails(
      basePackageInfo,
      filePath,
      baseFileDetails,
      resolvedCodeFileDetails
    );
  }
  return resolvedPackageInfo;
}

export function addResolvedInfoForFile(
  filePath: string,
  newBasePackageInfo: BasePackageInfo,
  previousResolvedPackageInfo: ResolvedPackageInfo
) {
  const baseFileInfo = newBasePackageInfo.files.get(filePath);
  /* istanbul ignore if */
  if (!baseFileInfo) {
    exitWithInternalError(`Could not get base file info for ${filePath}`);
  }
  if (isCodeFile(filePath)) {
    /* istanbul ignore if */
    if (baseFileInfo.fileType !== 'code') {
      exitWithInternalError(`Mismatched file types for ${filePath}`);
    }
    const resolvedCodeFileDetails: ResolvedCodeFileDetails = {
      fileType: 'code',
      entryPointSpecifier: baseFileInfo.entryPointSpecifier,
      isExternallyImported: baseFileInfo.isExternallyImported,
      lastUpdatedAt: baseFileInfo.lastUpdatedAt,
      exports: [],
      singleImports: [],
      barrelImports: [],
      dynamicImports: [],
      sideEffectImports: [],
      singleReexports: [],
      barrelReexports: [],
    };
    previousResolvedPackageInfo.files.set(filePath, resolvedCodeFileDetails);
    populateFileDetails(
      newBasePackageInfo,
      filePath,
      baseFileInfo,
      resolvedCodeFileDetails
    );
  } else {
    previousResolvedPackageInfo.files.set(filePath, {
      fileType: 'other',
    });
  }
}

export function updateResolvedInfoForFile(
  filePath: string,
  basePackageInfo: BasePackageInfo,
  resolvedPackageInfo: ResolvedPackageInfo
) {
  const filePathsToUpdate = [
    filePath,
    ...getFileReferences(resolvedPackageInfo, filePath),
  ];
  for (const filePathToUpdate of filePathsToUpdate) {
    const baseFileInfo = basePackageInfo.files.get(filePathToUpdate);
    /* istanbul ignore if */
    if (!baseFileInfo) {
      exitWithInternalError(
        `Could not get base file info for ${filePathToUpdate}`
      );
    }
    /* istanbul ignore if */
    if (baseFileInfo.fileType !== 'code') {
      exitWithInternalError(`Mismatched file types for ${filePathToUpdate}`);
    }
    const resolvedCodeFileDetails: ResolvedCodeFileDetails = {
      fileType: 'code',
      entryPointSpecifier: baseFileInfo.entryPointSpecifier,
      isExternallyImported: baseFileInfo.isExternallyImported,
      lastUpdatedAt: baseFileInfo.lastUpdatedAt,
      exports: [],
      singleImports: [],
      barrelImports: [],
      dynamicImports: [],
      sideEffectImports: [],
      singleReexports: [],
      barrelReexports: [],
    };
    populateFileDetails(
      basePackageInfo,
      filePathToUpdate,
      baseFileInfo,
      resolvedCodeFileDetails
    );
    resolvedPackageInfo.files.set(filePathToUpdate, resolvedCodeFileDetails);
  }
}

export function deleteResolvedInfoForFile(
  filePath: string,
  newBasePackageInfo: BasePackageInfo,
  previousResolvedPackageInfo: ResolvedPackageInfo
) {
  const baseFileInfo = newBasePackageInfo.files.get(filePath);
  /* istanbul ignore if */
  if (!baseFileInfo) {
    exitWithInternalError(`Could not get base file info for ${filePath}`);
  }

  const filePathsToUpdate = getFileReferences(
    previousResolvedPackageInfo,
    filePath
  );
  for (const filePathToUpdate of filePathsToUpdate) {
    const fileDetailsToUpdate =
      previousResolvedPackageInfo.files.get(filePathToUpdate);

    /* istanbul ignore if */
    if (!fileDetailsToUpdate) {
      exitWithInternalError(
        'filePathToUpdate missing in resolved package info'
      );
    }

    /* istanbul ignore if */
    if (fileDetailsToUpdate.fileType !== 'code') {
      exitWithInternalError('fileDetailsToUpdate is not a code file');
    }

    // We have to wait to delete the file info until after we're done fetching
    // related files, since we use info about this first file in the search.
    // However, we also have to delete this before we actually process the files
    // needing updates so they don't think the file is still there
    previousResolvedPackageInfo.files.delete(filePath);

    const resolvedCodeFileDetails: ResolvedCodeFileDetails = {
      fileType: 'code',
      entryPointSpecifier: fileDetailsToUpdate.entryPointSpecifier,
      isExternallyImported: fileDetailsToUpdate.isExternallyImported,
      lastUpdatedAt: fileDetailsToUpdate.lastUpdatedAt,
      exports: [],
      singleImports: [],
      barrelImports: [],
      dynamicImports: [],
      sideEffectImports: [],
      singleReexports: [],
      barrelReexports: [],
    };
    previousResolvedPackageInfo.files.set(
      filePathToUpdate,
      resolvedCodeFileDetails
    );
    populateFileDetails(
      newBasePackageInfo,
      filePathToUpdate,
      fileDetailsToUpdate,
      resolvedCodeFileDetails
    );
  }
}

export function computeFolderTree(baseInfo: BasePackageInfo) {
  // Reset the cache before we start
  const folderTree: FolderTreeNode = {
    folders: {},
    files: {},
    filesAndExtensions: {},
  };
  folderTrees.set(baseInfo.packageRootDir, folderTree);
  for (const [file] of baseInfo.files) {
    const folders = splitPathIntoSegments(
      getRelativePathFromRoot(baseInfo.packageRootDir, file)
    );
    const basefile = folders.pop();
    /* istanbul ignore if */
    if (!basefile) {
      exitWithInternalError(`Could not get basefile for path ${file}`);
    }

    let currentFolderTreeNode = folderTree;

    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    while (true) {
      const currentFolder = folders.shift();
      if (!currentFolder) {
        break;
      }

      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      if (!currentFolderTreeNode.folders[currentFolder]) {
        currentFolderTreeNode.folders[currentFolder] = {
          folders: {},
          files: {},
          filesAndExtensions: {},
        };
      }
      currentFolderTreeNode = currentFolderTreeNode.folders[currentFolder];
    }

    currentFolderTreeNode.files[basefile] = 1;
    const extension = basefile.endsWith('.d.ts')
      ? '.d.ts'
      : basefile.endsWith('.d.tsx')
        ? '.d.tsx'
        : extname(basefile);
    const baseFileName = basename(basefile, extension);

    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (!currentFolderTreeNode.filesAndExtensions[baseFileName]) {
      currentFolderTreeNode.filesAndExtensions[baseFileName] = [];
    }
    currentFolderTreeNode.filesAndExtensions[baseFileName].push(extension);
  }
}

// Find all files that import/reexport from this file, or that this file is imported from
function getFileReferences(
  previousResolvedPackageInfo: ResolvedPackageInfo,
  filePath: string
) {
  const fileReferences = [];
  const previousResolvedFileEntry =
    previousResolvedPackageInfo.files.get(filePath);
  /* istanbul ignore if */
  if (!previousResolvedFileEntry) {
    exitWithInternalError(
      `Could not get previous resolved entry for ${filePath}`
    );
  }

  for (const [
    candidateFilePath,
    candidateFileDetails,
  ] of previousResolvedPackageInfo.files) {
    if (
      candidateFileDetails.fileType !== 'code' ||
      candidateFilePath === filePath
    ) {
      continue;
    }

    // Look for imports or the import side of reexports to see if they reference this file
    const doesCandidateImportFile = [
      ...candidateFileDetails.singleImports,
      ...candidateFileDetails.barrelImports,
      ...candidateFileDetails.dynamicImports,
      ...candidateFileDetails.sideEffectImports,
      ...candidateFileDetails.singleReexports,
      ...candidateFileDetails.barrelReexports,
    ].some(
      (i) => 'resolvedModulePath' in i && i.resolvedModulePath === filePath
    );

    // If this file isn't a code file, then it can only be imported
    if (previousResolvedFileEntry.fileType === 'other') {
      if (doesCandidateImportFile) {
        fileReferences.push(candidateFilePath);
      }
      continue;
    }

    // Look for exports or the export side of reexports to see if this file references them
    const doesFileImportCandidate = [
      ...previousResolvedFileEntry.singleImports,
      ...previousResolvedFileEntry.barrelImports,
      ...previousResolvedFileEntry.dynamicImports,
      ...previousResolvedFileEntry.sideEffectImports,
      ...previousResolvedFileEntry.singleReexports,
      ...previousResolvedFileEntry.barrelReexports,
    ].some(
      (i) =>
        i.resolvedModuleType === 'firstPartyCode' &&
        i.resolvedModulePath === filePath
    );

    // If this file is a code file, we have to check both possibilities
    if (doesCandidateImportFile || doesFileImportCandidate) {
      fileReferences.push(candidateFilePath);
    }
  }

  return fileReferences;
}

function populateFileDetails(
  basePackageInfo: BasePackageInfo,
  filePath: string,
  baseCodeFileDetails: BaseCodeFileDetails,
  resolvedCodeFileDetails: ResolvedCodeFileDetails
) {
  // Note: every base entry gets a resolved counterpart, in order. The range-only
  // cache update in module.ts patches resolved and analyzed entries by index
  // from the base entries, so the three phases must stay index-aligned. An
  // empty module specifier (what an editor leaves behind after auto-closing
  // the quotes) resolves to a third party module like any other unknown
  // specifier; a dynamic import with no static specifier can't be resolved at
  // all and lands in the "could not resolve" bucket.

  // Resolve single imports
  for (const importDetails of baseCodeFileDetails.singleImports) {
    const resolvedModuleSpecifier = resolveModuleSpecifier({
      basePackageInfo,
      filePath,
      moduleSpecifier: importDetails.moduleSpecifier,
      isTypeImport: importDetails.isTypeImport,
    });
    resolvedCodeFileDetails.singleImports.push({
      ...importDetails,
      ...resolvedModuleSpecifier,
    });
  }

  // Resolve barrel imports
  for (const importDetails of baseCodeFileDetails.barrelImports) {
    const resolvedModuleSpecifier = resolveModuleSpecifier({
      basePackageInfo,
      filePath,
      moduleSpecifier: importDetails.moduleSpecifier,
      isTypeImport: importDetails.isTypeImport,
    });
    resolvedCodeFileDetails.barrelImports.push({
      ...importDetails,
      ...resolvedModuleSpecifier,
    });
  }

  // Resolve dynamic imports
  for (const importDetails of baseCodeFileDetails.dynamicImports) {
    const resolvedModuleSpecifier: Resolved =
      importDetails.moduleSpecifier === undefined
        ? {
            resolvedModuleType: 'firstPartyOther',
            resolvedModulePath: undefined,
          }
        : resolveModuleSpecifier({
            basePackageInfo,
            filePath,
            moduleSpecifier: importDetails.moduleSpecifier,
            isTypeImport: false,
          });
    resolvedCodeFileDetails.dynamicImports.push({
      ...importDetails,
      ...resolvedModuleSpecifier,
    });
  }

  // Resolve side effect imports
  for (const importDetails of baseCodeFileDetails.sideEffectImports) {
    const resolvedModuleSpecifier = resolveModuleSpecifier({
      basePackageInfo,
      filePath,
      moduleSpecifier: importDetails.moduleSpecifier,
      isTypeImport: false,
    });
    resolvedCodeFileDetails.sideEffectImports.push({
      ...importDetails,
      ...resolvedModuleSpecifier,
    });
  }

  // Resolve single re-exports
  for (const reexportDetails of baseCodeFileDetails.singleReexports) {
    const resolvedModuleSpecifier = resolveModuleSpecifier({
      basePackageInfo,
      filePath,
      moduleSpecifier: reexportDetails.moduleSpecifier,
      isTypeImport: reexportDetails.isTypeReexport,
    });
    resolvedCodeFileDetails.singleReexports.push({
      ...reexportDetails,
      ...resolvedModuleSpecifier,
    });
  }

  // Resolve barrel re-exports
  for (const reexportDetails of baseCodeFileDetails.barrelReexports) {
    const resolvedModuleSpecifier = resolveModuleSpecifier({
      basePackageInfo,
      filePath,
      moduleSpecifier: reexportDetails.moduleSpecifier,
      isTypeImport: reexportDetails.isTypeReexport,
    });
    resolvedCodeFileDetails.barrelReexports.push({
      ...reexportDetails,
      ...resolvedModuleSpecifier,
    });
  }

  // We don't need to do anything for resolved exports, but we _do_ want to
  // deep-ish clone each export's details
  for (const exportDetails of baseCodeFileDetails.exports) {
    resolvedCodeFileDetails.exports.push({
      ...exportDetails,
    });
  }
}

type FolderTreeNode = {
  folders: Record<string, FolderTreeNode>;
  // e.g `{ 'foo.ts': 1 }`, useful for quick lookups based on a complete filename
  files: Record<string, 1>;
  // e.g. `{ foo: ['.ts']}`, useful for determining ambiguous file extensions
  filesAndExtensions: Record<string, string[]>;
};

// Map from packageRootDir to folder tree
const folderTrees = new Map<string, FolderTreeNode>();

const formattedBuiltinModules = builtinModules.filter(
  (m) => !m.startsWith('_')
);
for (let i = formattedBuiltinModules.length - 1; i >= 0; i--) {
  const builtinModule = formattedBuiltinModules[i];
  formattedBuiltinModules.push(`node:${builtinModule}`);
}

type ResolveModuleSpecifierOptions = {
  basePackageInfo: BasePackageInfo;
  filePath: string;
  moduleSpecifier: string;
  isTypeImport: boolean;
};

function resolveModuleSpecifier({
  basePackageInfo,
  filePath,
  moduleSpecifier,
  isTypeImport,
}: ResolveModuleSpecifierOptions): Resolved {
  // First, check if this is a built-in module
  if (formattedBuiltinModules.includes(moduleSpecifier)) {
    return {
      resolvedModuleType: 'builtin',
    };
  }

  // This function takes in a bath that is "absolute" looking but relative to
  // packageRootDir, excluding the leading /
  function resolveFirstPartyImport(absolutishFilePath: string) {
    /* eslint-disable @typescript-eslint/no-unnecessary-condition */

    // Check if this uses a Vite style import hints, and strip them out if so
    if (absolutishFilePath.includes('?')) {
      absolutishFilePath = absolutishFilePath.split('?')[0];
    }
    const segments = splitPathIntoSegments(absolutishFilePath);
    let lastSegment = segments.pop();
    const folderSegments = [...segments];
    /* istanbul ignore if */
    if (!lastSegment) {
      exitWithInternalError(
        `lastSegment for ${absolutishFilePath} is undefined`
      );
    }

    let currentFolderTreeNode = folderTrees.get(
      basePackageInfo.packageRootDir
    ) ?? {
      folders: {},
      files: {},
      filesAndExtensions: {},
    };
    while (true) {
      const currentFolderSegment = segments.shift();
      if (!currentFolderSegment) {
        break;
      }
      currentFolderTreeNode =
        currentFolderTreeNode.folders[currentFolderSegment];

      // If there is no folder segment present, then that means this is an unresolved import
      if (!currentFolderTreeNode) {
        return undefined;
      }
    }

    function computeFilePath(file: string) {
      return join(basePackageInfo.packageRootDir, ...folderSegments, file);
    }

    // First we check if this directly references a file + extension, and
    // shortcircuit, e.g.: `import { foo } from './foo.ts'` => 'foo.ts'
    if (currentFolderTreeNode.files[lastSegment]) {
      return computeFilePath(lastSegment);
    }

    // Check the special edge case of importing a file in TypeScript with
    // nodenext resolution, where the extension has `.js`, not `.ts`. To support
    // this edge case, we just strip off the .js since we support that anways
    if (lastSegment.endsWith('.js')) {
      lastSegment = lastSegment.slice(0, lastSegment.length - 3);
    }

    function findFileWithExtension(basename: string) {
      // Now we see if this references a file without an extension (the norm)
      const extensions = currentFolderTreeNode.filesAndExtensions[basename];
      if (!extensions) {
        return;
      }
      switch (extensions.length) {
        // Normally there's just one extension, so check this case first and return it
        case 1: {
          return computeFilePath(basename + extensions[0]);
        }

        // In the case of a vanilla JS file with a TS definition file, there will be two extensions
        case 2: {
          if (extensions.includes('.d.ts')) {
            if (isTypeImport) {
              return computeFilePath(basename + '.d.ts');
            } else if (extensions.includes('.js')) {
              return computeFilePath(basename + '.js');
            } else if (extensions.includes('.jsx')) {
              return computeFilePath(basename + '.jsx');
            }
          }
          // Intentionally fall through here, since we didn't find an expected
          // pair of files
        }

        // Otherwise we have multiple extensions in a non-paired configuration
        // eslint-disable-next-line no-fallthrough
        default: {
          // If there is only one code file, then we can resolve to that file,
          // since the only extensionless imports are for code files.
          let numCodeFiles = 0;
          let candidateExtension: string | undefined;
          for (const extension of extensions) {
            if (isCodeFile(computeFilePath(basename + extension))) {
              numCodeFiles++;
              candidateExtension = extension;
            }
          }
          if (numCodeFiles === 1 && candidateExtension) {
            return computeFilePath(basename + candidateExtension);
          }
          exitWithError(
            `Module specifier ${moduleSpecifier} in file ${filePath} is ambiguous because there is more than one file with this name`
          );
        }
      }
    }

    let computedFilePath = findFileWithExtension(lastSegment);
    if (computedFilePath) {
      return computedFilePath;
    }

    // Now we check if this references an index file, but only if a folder with
    // this segment exists
    currentFolderTreeNode = currentFolderTreeNode.folders[lastSegment];
    if (!currentFolderTreeNode) {
      return undefined;
    }
    folderSegments.push(lastSegment);

    computedFilePath = findFileWithExtension('index');
    if (computedFilePath) {
      return computedFilePath;
    }

    // If we got here, then we couldn't find a file entry
    return undefined;
    /* eslint-enable @typescript-eslint/no-unnecessary-condition */
  }

  function formatResolvedEntry(
    resolvedModulePath: string | undefined
  ): Resolved {
    if (!resolvedModulePath) {
      return {
        resolvedModuleType: 'firstPartyOther',
        resolvedModulePath: undefined,
      };
    }
    return {
      resolvedModuleType: isCodeFile(resolvedModulePath)
        ? 'firstPartyCode'
        : 'firstPartyOther',
      resolvedModulePath,
    };
  }

  const dirPath = dirname(filePath);

  // Check if this path is relative, which means its first party
  if (moduleSpecifier.startsWith('.')) {
    const resolvedPath = resolve(dirPath, moduleSpecifier);
    // We have to account for a very specific edge case. When a user does an
    // import with a specifier like `../..` such that the absolitish path
    // resolves to the root dir itself, then the standard absolitish path is
    // computed to be '' (empty string). In this case, the import may still be
    // valid though if there is an index file in the root folder. We pre-apply
    // index in this case so that there are still path segments to resolve.
    const absolutish =
      resolvedPath === basePackageInfo.packageRootDir
        ? 'index'
        : getRelativePathFromRoot(basePackageInfo.packageRootDir, resolvedPath);
    const resolvedModulePath = resolveFirstPartyImport(absolutish);
    return formatResolvedEntry(resolvedModulePath);
  }

  // Check if this path starts with the a wildcard alias, which means its first party
  for (const [alias, path] of Object.entries(basePackageInfo.wildcardAliases)) {
    if (moduleSpecifier.startsWith(alias)) {
      const absolutishPath = getRelativePathFromRoot(
        basePackageInfo.packageRootDir,
        path
      );
      const resolvedModulePath = resolveFirstPartyImport(
        join(moduleSpecifier.replace(alias, absolutishPath))
      );
      return formatResolvedEntry(resolvedModulePath);
    }
  }

  // Check if this path is exactly a fixed alias, which means its first party
  for (const [alias, path] of Object.entries(basePackageInfo.fixedAliases)) {
    if (moduleSpecifier === alias) {
      // A fixed alias names its target outright, so unlike the two walks above
      // nothing has checked that the target is a file we analyze. An alias into
      // an ignored folder (`dist/`, a dot-folder) is the usual way it isn't.
      // Treat that like any other specifier that resolves to nothing, or phase
      // 3 will look the file up and fail.
      return formatResolvedEntry(
        basePackageInfo.files.has(path) ? path : undefined
      );
    }
  }

  // If we got here, then this is a third party import
  return {
    resolvedModuleType: 'thirdParty',
  };
}
