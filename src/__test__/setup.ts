import { beforeEach, expect, jest } from '@jest/globals';
import deepEqual from 'fast-deep-equal';
import { diff } from 'jest-diff';

import { _testOnlyResetPackageInfo } from '../module/module.js';
import { _testOnlyResetAllSettings } from '../settings/settings.js';
import type { AnalyzedPackageInfo } from '../types/analyzed.js';
import type { BaseESMStatement, BasePackageInfo } from '../types/base.js';
import { _testOnlyResetFiles } from '../util/files.js';
import type {
  StrippedAnalyzedFileDetails,
  StrippedBaseFileDetails,
  StrippedResolvedFileDetails,
} from './util.js';

function checkPackageObject(packageInfo: unknown) {
  if (typeof packageInfo !== 'object' || packageInfo === null) {
    return {
      message: () => `Expected: an object\nReceived: not an object`,
      pass: false,
    };
  }

  if (!('files' in packageInfo) || !(packageInfo.files instanceof Map)) {
    return {
      message: () =>
        `Expected: an object of files\nReceived: not an object of files`,
      pass: false,
    };
  }

  return undefined;
}

function toMatchSpec<
  FileDetails extends
    | StrippedBaseFileDetails
    | StrippedResolvedFileDetails
    | StrippedAnalyzedFileDetails,
>(basePackageInfo: unknown, baseSpec: Record<string, FileDetails>) {
  const result = checkPackageObject(basePackageInfo);
  if (result) {
    return result;
  }

  const files = (basePackageInfo as BasePackageInfo).files;

  for (const [filePath, fileDetails] of files.entries()) {
    const expectedFileDetails = baseSpec[filePath];

    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (!expectedFileDetails) {
      return {
        message: () => `file path ${filePath} is not in the base spec`,
        pass: false,
      };
    }

    if (expectedFileDetails.fileType !== fileDetails.fileType) {
      return {
        message: () => `file path ${filePath} has the wrong file type`,
        pass: false,
      };
    }

    if (
      expectedFileDetails.fileType === 'other' ||
      fileDetails.fileType === 'other'
    ) {
      continue;
    }

    if (
      expectedFileDetails.entryPointSpecifier !==
      fileDetails.entryPointSpecifier
    ) {
      return {
        message: () =>
          `file path ${filePath} has the wrong entryPointSpecifier: expected ${String(expectedFileDetails.entryPointSpecifier)}, received ${String(fileDetails.entryPointSpecifier)}`,
        pass: false,
      };
    }

    if (
      expectedFileDetails.isExternallyImported !==
      fileDetails.isExternallyImported
    ) {
      return {
        message: () =>
          `file path ${filePath} has the wrong hasExternallyImported: expected ${String(expectedFileDetails.isExternallyImported)}, received ${String(fileDetails.isExternallyImported)}`,
        pass: false,
      };
    }

    if (expectedFileDetails.exports.length !== fileDetails.exports.length) {
      return {
        message: () =>
          `file path ${filePath} has the wrong number of exports.` +
          `Expected ${expectedFileDetails.exports.length.toString()}, received ${fileDetails.exports.length.toString()}`,
        pass: false,
      };
    }
    if (
      expectedFileDetails.singleReexports.length !==
      fileDetails.singleReexports.length
    ) {
      return {
        message: () =>
          `file path ${filePath} has the wrong number of singleReexports.` +
          `Expected ${expectedFileDetails.singleReexports.length.toString()}, received ${fileDetails.singleReexports.length.toString()}`,
        pass: false,
      };
    }
    if (
      expectedFileDetails.barrelReexports.length !==
      fileDetails.barrelReexports.length
    ) {
      return {
        message: () =>
          `file path ${filePath} has the wrong number of barrelReexports.` +
          `Expected ${expectedFileDetails.barrelReexports.length.toString()}, received ${fileDetails.barrelReexports.length.toString()}`,
        pass: false,
      };
    }
    if (
      expectedFileDetails.singleImports.length !==
      fileDetails.singleImports.length
    ) {
      return {
        message: () =>
          `file path ${filePath} has the wrong number of singleImports.` +
          `Expected ${expectedFileDetails.singleImports.length.toString()}, received ${fileDetails.singleImports.length.toString()}`,
        pass: false,
      };
    }
    if (
      expectedFileDetails.barrelImports.length !==
      fileDetails.barrelImports.length
    ) {
      return {
        message: () =>
          `file path ${filePath} has the wrong number of barrelImports.` +
          `Expected ${expectedFileDetails.barrelImports.length.toString()}, received ${fileDetails.barrelImports.length.toString()}`,
        pass: false,
      };
    }
    if (
      expectedFileDetails.dynamicImports.length !==
      fileDetails.dynamicImports.length
    ) {
      return {
        message: () =>
          `file path ${filePath} has the wrong number of dynamicImports.` +
          `Expected ${expectedFileDetails.dynamicImports.length.toString()}, received ${fileDetails.dynamicImports.length.toString()}`,
        pass: false,
      };
    }
    if (
      expectedFileDetails.sideEffectImports.length !==
      fileDetails.sideEffectImports.length
    ) {
      return {
        message: () =>
          `file path ${filePath} has the wrong number of sideEffectImports.` +
          `Expected ${expectedFileDetails.sideEffectImports.length.toString()}, received ${fileDetails.sideEffectImports.length.toString()}`,
        pass: false,
      };
    }

    function compareSet(expected: object[], actual: BaseESMStatement[]) {
      const actualStripped = actual.map(
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        ({ statementNodeRange, reportNodeRange, ...rest }) => rest
      );
      if (!deepEqual(expected, actualStripped)) {
        const formattedDiff = diff(expected, actualStripped);
        /* istanbul ignore if */
        if (!formattedDiff) {
          throw new Error('formattedDiff is undefined');
        }
        return formattedDiff;
      }
      return undefined;
    }

    for (const prop of [
      'exports',
      'singleImports',
      'barrelImports',
      'dynamicImports',
      'sideEffectImports',
      'singleReexports',
      'barrelReexports',
    ] as const) {
      const setDiff = compareSet(expectedFileDetails[prop], fileDetails[prop]);
      if (setDiff) {
        return {
          message: () => `${filePath}:${prop} mismatch:\n${setDiff}`,
          pass: false,
        };
      }
    }
  }

  return {
    message: () => `Expected matches spec`,
    pass: true,
  };
}

expect.extend({
  toMatchBaseSpec(
    basePackageInfo: unknown,
    baseSpec: Record<string, StrippedBaseFileDetails>
  ) {
    return toMatchSpec(basePackageInfo, baseSpec);
  },
  toMatchResolvedSpec(
    resolvedPackageInfo: unknown,
    resolvedSpec: Record<string, StrippedResolvedFileDetails>
  ) {
    return toMatchSpec(resolvedPackageInfo, resolvedSpec);
  },
  toMatchAnalyzedSpec(
    analyzedPackageInfo: unknown,
    analyzedSpec: Record<string, StrippedAnalyzedFileDetails>
  ) {
    const result = checkPackageObject(analyzedPackageInfo);
    if (result) {
      return result;
    }

    // Every cross-reference in analyzed info (an origin in importedBy /
    // barrelImportedBy / externallyImportedBy, or a rootExportEntry) points at
    // a live entry in another file, which itself holds ranges and more
    // cross-references. Replace each with a shallow copy stripped of ranges
    // and of its own cross-references, so expectations stay one level deep
    // and the comparison can't recurse back through the import graph. The
    // key set here is the one `StrippedOrigin` in util.ts omits.
    function stripReference<T extends object>(reference: T): T {
      const copy = { ...reference } as Record<string, unknown>;
      delete copy.statementNodeRange;
      delete copy.reportNodeRange;
      delete copy.rootExportEntry;
      delete copy.importedBy;
      delete copy.barrelImportedBy;
      delete copy.externallyImportedBy;
      return copy as T;
    }
    for (const [, fileDetails] of (analyzedPackageInfo as AnalyzedPackageInfo)
      .files) {
      if (fileDetails.fileType !== 'code') {
        continue;
      }
      for (const entry of [
        ...fileDetails.exports,
        ...fileDetails.singleReexports,
        ...fileDetails.barrelReexports,
        ...fileDetails.singleImports,
        ...fileDetails.barrelImports,
        ...fileDetails.dynamicImports,
        ...fileDetails.sideEffectImports,
      ]) {
        if ('importedBy' in entry) {
          for (const origin of entry.importedBy) {
            origin.importEntry = stripReference(origin.importEntry);
          }
        }
        if ('barrelImportedBy' in entry) {
          for (const origin of entry.barrelImportedBy) {
            origin.importEntry = stripReference(origin.importEntry);
          }
        }
        if ('externallyImportedBy' in entry) {
          for (const origin of entry.externallyImportedBy) {
            origin.importEntry = stripReference(origin.importEntry);
          }
        }
        if ('rootExportEntry' in entry && entry.rootExportEntry) {
          entry.rootExportEntry = stripReference(entry.rootExportEntry);
        }
      }
    }
    return toMatchSpec(analyzedPackageInfo, analyzedSpec);
  },
});

// Production code uses `exitWithError` / `exitWithInternalError` (which call
// `console.error` then `process.exit(1)`) instead of throwing, so that oxlint
// can't swallow plugin failures. Under test we shim those into a throw whose
// message is the original error message, so existing `toThrow(...)` assertions
// keep working.
let lastConsoleError = '';
jest.spyOn(console, 'error').mockImplementation((msg: unknown) => {
  // `exitWithInternalError` calls console.error twice (message then stack);
  // keep the first, which is what tests assert on.
  if (!lastConsoleError) lastConsoleError = String(msg);
});
jest.spyOn(process, 'exit').mockImplementation(() => {
  const message = lastConsoleError;
  lastConsoleError = '';
  throw new Error(message);
});

beforeEach(() => {
  lastConsoleError = '';
  _testOnlyResetAllSettings();
  _testOnlyResetPackageInfo();
  _testOnlyResetFiles();
});
