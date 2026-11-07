import type { TSESTree } from '@typescript-eslint/utils';

import type { ParsedPackageSettings } from '../settings/settings.js';

export type BaseESMStatement = {
  /**
   * The AST node range of the complete ESM statement for this entry
   */
  statementNodeRange: TSESTree.Node['range'];

  // TODO: convert this to "moduleSpecifierNodeRange", "importNameNodeRange", etc.
  /**
   * The AST node range to report an error on, if one exists.
   *
   * Note: this may not be the node representing the entire ESM statement
   */
  reportNodeRange: TSESTree.Node['range'];
};

/* Imports */

export type BaseSingleImport = BaseESMStatement & {
  /**
   * A top-level type that can be used at runtime to see what type of ESM
   * statement this is
   */
  type: 'singleImport';

  /**
   * Where we're importing from, e.g. `'./bar'` in:
   *
   * ```
   * import { foo } from './bar'
   * ```
   */
  moduleSpecifier: string;

  /**
   * What we're importing, e.g. `foo` in:
   *
   * ```
   * import { foo } from './bar'
   * ```
   */
  importName: string;

  /**
   * What we're calling the import locally. This is usually the same as
   * `importName`, but can sometimes be different. If we do:
   *
   * ```
   * import { foo as alias } from './bar'
   * ```
   *
   * then `importName` equals `foo` and `importAlias` equals `alias`
   */
  importAlias: string;

  /**
   * If true, then this is a TypeScript type import, e.g.
   *
   * ```
   * import type { Foo } from './bar'
   * ```
   */
  isTypeImport: boolean;
};

export type BaseBarrelImport = BaseESMStatement & {
  /**
   * A top-level type that can be used at runtime to see what type of ESM
   * statement this is
   */
  type: 'barrelImport';

  /**
   * Where we're importing from, e.g. `'./bar'` in:
   *
   * ```
   * import * as foo from './bar'
   * ```
   */
  moduleSpecifier: string;

  /**
   * What we're calling the import, named for consistency with single imports. If
   * we do:
   *
   * ```
   * import * as foo from './bar'
   * ```
   *
   * then `importAlias` equals `foo`
   */
  importAlias: string;

  /**
   * If true, then this is a TypeScript type import, e.g.
   *
   * ```
   * import type * as foo from './bar'
   * ```
   */
  isTypeImport: boolean;
};

export type BaseDynamicImport = BaseESMStatement & {
  /**
   * A top-level type that can be used at runtime to see what type of ESM
   * statement this is
   */
  type: 'dynamicImport';

  /**
   * Where we're importing from, e.g. `'./bar'` in:
   *
   * ```
   * import('./bar')
   * ```
   *
   * Note: `undefined` when the specifier is not a string literal, e.g.
   * `import(someVariable)`. The statement is still recorded, so that every
   * import has an entry, but it cannot be resolved.
   */
  moduleSpecifier: string | undefined;
};

export type BaseSideEffectImport = BaseESMStatement & {
  /**
   * A top-level type that can be used at runtime to see what type of ESM
   * statement this is
   */
  type: 'sideEffectImport';

  /**
   * Where we're importing from, e.g. `'./bar'` in:
   *
   * ```
   * import './bar';
   * ```
   *
   * Import declarations only accept a string literal, so this is always set.
   */
  moduleSpecifier: string;
};

/* Exports */

export type BaseExport = BaseESMStatement & {
  /**
   * A top-level type that can be used at runtime to see what type of ESM
   * statement this is
   */
  type: 'export';

  /**
   * What we're export, e.g. `foo` in:
   *
   * ```
   * export const foo = 10;
   * ```
   */
  exportName: string; // Default exports are represented by the string "default"

  /**
   * Indicates whether or not this rexport is an entry point for the app. For
   * example, if this is a src/index.ts file specified as an export in
   * package.json, the we consider this an an entry point export since we'll
   * never see the import itself
   */
  isEntryPoint: boolean;

  /**
   * Indicates whether or not this reexport is externally imported. For example,
   * if we're running a Next.js app and this export is `getServerSideProps` in a
   * page file, the we consider this an externally imported export since we'll
   * never see the import itself
   */
  isExternallyImported: boolean;

  /**
   * If true, then this is a TypeScript type import, e.g.
   *
   * ```
   * export type Foo = 10;
   * ```
   */
  isTypeExport: boolean;
};

/* Reexports */

export type BaseSingleReexport = BaseESMStatement & {
  /**
   * A top-level type that can be used at runtime to see what type of ESM
   * statement this is
   */
  type: 'singleReexport';

  /**
   * Where we're reexporting from, e.g. `'./bar'` in:
   *
   * ```
   * export { foo } from './bar'
   * ```
   */
  moduleSpecifier: string;

  /**
   * What we're reexporting, e.g. `foo` in:
   *
   * ```
   * export { foo } from './bar'
   * ```
   */
  importName: string;

  /**
   * What we're naming the reexport. This is usually the same as `importName`,
   * but can sometimes be different. If we do:
   *
   * ```
   * export { foo as alias } from './bar'
   * ```
   *
   * then `importName` equals `foo` and `exportName` equals `alias`
   */
  exportName: string;

  /**
   * If true, then this is a TypeScript type reexport, e.g.
   *
   * ```
   * export type { Foo } from './bar'
   * ```
   */
  isTypeReexport: boolean;

  /**
   * Indicates whether or not this rexport is an entry point for the app. For
   * example, if this is a src/index.ts file specified as an export in
   * package.json, the we consider this an an entry point export since we'll
   * never see the import itself
   */
  isEntryPoint: boolean;

  /**
   * Indicates whether or not this reexport is externally imported. For example,
   * if we're running a Next.js app and this export is `getServerSideProps` in a
   * page file, the we consider this an externally imported export since we'll
   * never see the import itself
   */
  isExternallyImported: boolean;
};

export type BaseBarrelReexport = BaseESMStatement & {
  /**
   * A top-level type that can be used at runtime to see what type of ESM
   * statement this is
   */
  type: 'barrelReexport';

  /**
   * Where we're reexporting from, e.g. `'./bar'` in:
   *
   * ```
   * export * from './bar'
   * ```
   */
  moduleSpecifier: string;

  /**
   * The name of the rollup object, if specified, e.g. `foo` in:
   *
   * ```
   * export * as foo from './bar'
   * ```
   */
  exportName: string | undefined;

  /**
   * If true, then this is a TypeScript type reexport, e.g.
   *
   * ```
   * export type * from './bar'
   * export type * as foo from './bar'
   * ```
   */
  isTypeReexport: boolean;

  /**
   * Indicates whether or not this rexport is an entry point for the app. For
   * example, if this is a src/index.ts file specified as an export in
   * package.json, the we consider this an an entry point export since we'll
   * never see the import itself
   */
  isEntryPoint: boolean;

  /**
   * Indicates whether or not this reexport is externally imported. For example,
   * if we're running a Next.js app and this export is `getServerSideProps` in a
   * page file, the we consider this an externally imported export since we'll
   * never see the import itself
   */
  isExternallyImported: boolean;
};

/* File Details */

/**
 * This represents a file that is imported in ESM code, but is not an ESM file.
 * Examples include importing CSS or JSON files. These files get an entry for
 * bookeeping reasons, but otherwise are not parsed or anlayzed
 */
export type BaseOtherFileDetails = {
  fileType: 'other';
};

/**
 * Represents an ESM file and its imports, exports, and reexports.
 */
export type BaseCodeFileDetails = {
  fileType: 'code';

  /**
   * Timestamp of when the file was last updated, or start time of the plugin,
   * whichever is later.
   */
  lastUpdatedAt: number;

  /**
   * If this file is an entry point file, `entryPointSpecifier` will be the
   * module specifier used to import it externally. If this file is not an entry
   * point, `entryPointSpecifier` will be undefined.
   *
   * For example, if this file is `src/foo.ts`, the package name is
   * `my-package`, and package.json "exports" is `{ "./foo": "./dist/foo.js" }`,
   * then `entryPointSpecifier` will be `my-package/foo`.
   */
  entryPointSpecifier: string | undefined;

  /**
   * Indicates whether or not any of this file's exports are externally imported
   */
  isExternallyImported: boolean;

  exports: BaseExport[];
  singleImports: BaseSingleImport[];
  barrelImports: BaseBarrelImport[];
  dynamicImports: BaseDynamicImport[];
  sideEffectImports: BaseSideEffectImport[];
  singleReexports: BaseSingleReexport[];
  barrelReexports: BaseBarrelReexport[];
};

type BaseFileDetails = BaseOtherFileDetails | BaseCodeFileDetails;

export type BasePackageInfo = {
  /**
   * Mapping of _absolute_ file paths to file details
   */
  files: Map<string, BaseFileDetails>;

  /**
   * The name of the package
   */
  packageName: string | undefined;

  /**
   * The root path of the package
   */
  packageRootDir: string;

  /**
   * An alias for referencing first party imports absolutely.
   */
  fixedAliases: ParsedPackageSettings['fixedAliases'];

  /**
   * For example, Next.js defaults to `@`, meaning
   * a file at `src/components/foo` can be imported anywhere with `@/components/foo`
   */
  wildcardAliases: ParsedPackageSettings['wildcardAliases'];

  /**
   * Mapping of available third party dependencies by module specifier name
   * scoped to the folder they're in. For example, in the case of a monorepo
   * with the following structure:
   *
   * myProject
   *   package.json
   *   one
   *     package.json
   *   two
   *     package.json
   *
   * we get:
   *
   * {
   *   '/path/to/myProject' => ['react', 'typescript'],
   *   '/path/to/myProject/one' => ['type-fest'],
   *   '/path/to/myProjecttwo' => ['react-hook-form'],
   * }
   *
   * Note: any sub-paths in module specifiers are not included here, e.g.
   * `foo/dist/file`, just `foo`
   */
  availableThirdPartyDependencies: Map<string, string[]>;
};
