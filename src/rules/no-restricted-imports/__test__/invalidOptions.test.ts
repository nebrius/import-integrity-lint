import { join } from 'node:path';

import type { ESLint } from 'eslint';
import { Linter } from 'eslint';

import { noRestrictedImports } from '../rule.js';

const TEST_PACKAGE_DIR = join(import.meta.dirname, 'project');
const FILE_A = join(TEST_PACKAGE_DIR, 'a.ts');

// ESLint's rule types and typescript-eslint's don't line up, though the rule
// is the same object at runtime
const plugin = {
  rules: { 'no-restricted-imports': noRestrictedImports },
} as unknown as ESLint.Plugin;

// Run the rule's create() directly with the given options, the way a host
// would after its own schema validation (or after none)
function createWithOptions(options: unknown[]) {
  const context = {
    options,
    filename: FILE_A,
    settings: { 'import-integrity': { packageRootDir: TEST_PACKAGE_DIR } },
  } as unknown as Parameters<typeof noRestrictedImports.create>[0];
  return () => noRestrictedImports.create(context);
}

// The rule restricts nothing without options, so enabling it without any is a
// configuration mistake, never a silent no-op.

it('Fails ESLint config validation when enabled without options', () => {
  const linter = new Linter({ configType: 'flat' });
  expect(() =>
    linter.verify(
      'export {};',
      [
        {
          files: ['**/*.ts'],
          plugins: { 'import-integrity': plugin },
          rules: { 'import-integrity/no-restricted-imports': 'error' },
          settings: {
            'import-integrity': { packageRootDir: TEST_PACKAGE_DIR },
          },
        },
      ],
      FILE_A
    )
  ).toThrow(/should NOT have fewer than 1 items/);
});

// The rule validates its options itself: ESLint 9 has been seen running rules
// whose options fail the schema, and the schema has to accept anything where a
// RegExp goes, so no host can reject a RegExp that was serialized to {}
it('Exits with a configuration error when its options are missing at runtime', () => {
  expect(createWithOptions([])).toThrow(
    'Rule import-integrity/no-restricted-imports was enabled without options'
  );
});

it.each([
  ['filepath', { type: 'first-party', filepath: {} }, 'rules[0].filepath'],
  [
    'moduleSpecifier',
    { type: 'third-party', moduleSpecifier: {} },
    'rules[0].moduleSpecifier',
  ],
  [
    'allowed',
    { type: 'first-party', filepath: './b.ts', allowed: [{}] },
    'rules[0].allowed[0]',
  ],
])(
  'Explains a RegExp that was serialized to an empty object in %s',
  (_, entry, path) => {
    const create = createWithOptions([{ rules: [entry] }]);
    expect(create).toThrow(
      'This is what a RegExp literal becomes after JSON serialization'
    );
    expect(create).toThrow(`→ at ${path}`);
  }
);

it.each([
  ['an object with the wrong key', { pattern: 'b\\.ts$' }],
  ['a number', 5],
])('Rejects %s where a pattern goes', (_, filepath) => {
  const create = createWithOptions([
    { rules: [{ type: 'first-party', filepath }] },
  ]);
  expect(create).toThrow(
    'Expected a string, a RegExp, or { regex: string, flags?: string }'
  );
  expect(create).not.toThrow('JSON serialization');
});

// The message of the configuration error for a single invalid entry
function getOptionsError(entry: unknown) {
  try {
    createWithOptions([{ rules: [entry] }])();
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
  throw new Error('The options were accepted');
}

// Every invalid option is reported through one error that names the option's
// path within the rule's options
it.each([
  [
    'an unknown key in the { regex } form',
    { type: 'first-party', filepath: { regex: 'b\\.ts$', flagz: 'i' } },
    'Unrecognized key: "flagz"',
    'rules[0].filepath',
  ],
  [
    'an invalid regular expression in the { regex } form',
    { type: 'first-party', filepath: { regex: '(' } },
    'Invalid regular expression {"regex":"("}',
    'rules[0].filepath',
  ],
  [
    'invalid flags in the { regex } form',
    { type: 'first-party', filepath: { regex: 'b', flags: 'q' } },
    'Invalid regular expression {"regex":"b","flags":"q"}',
    'rules[0].filepath',
  ],
  // Both flags make a RegExp continue from where its previous match ended,
  // and the same instance is reused across files
  [
    'a g flag on a RegExp literal',
    { type: 'first-party', filepath: /b\.ts$/g },
    "Regular expression /b\\.ts$/g can't use the g or y flag",
    'rules[0].filepath',
  ],
  [
    'a y flag in the { regex } form',
    { type: 'first-party', filepath: { regex: 'b', flags: 'y' } },
    "Regular expression /b/y can't use the g or y flag",
    'rules[0].filepath',
  ],
  [
    'a capture group reference above the number of groups in filepath',
    {
      type: 'first-party',
      filepath: /(a)\/(b)\.ts$/,
      allowed: ['./c.ts', /$3\/c\.ts$/],
    },
    'Invalid capture group reference $3 in /$3\\/c\\.ts$/: filepath /(a)\\/(b)\\.ts$/ has 2 capture groups',
    'rules[0].allowed[1]',
  ],
  [
    '$0, since references start at $1',
    { type: 'first-party', filepath: /(a)\.ts$/, denied: [/$0\.ts$/] },
    'Invalid capture group reference $0',
    'rules[0].denied[0]',
  ],
  [
    'a capture group reference when filepath is a string',
    { type: 'first-party', filepath: './b.ts', allowed: [/$1\.ts$/] },
    'filepath ./b.ts has 0 capture groups',
    'rules[0].allowed[0]',
  ],
  [
    'a capture group reference in a third-party entry',
    { type: 'third-party', moduleSpecifier: /^(node):/, allowed: [/$1\.ts$/] },
    'third-party entries have no filepath, so there are no capture groups to refer to',
    'rules[0].allowed[0]',
  ],
])('Rejects %s', (_, entry, message, path) => {
  const error = getOptionsError(entry);
  expect(error).toContain('Invalid options for rule');
  expect(error).toContain(message);
  expect(error).toContain(`→ at ${path}`);
});

it("Doesn't check capture group references in a pattern that failed to compile", () => {
  const error = getOptionsError({
    type: 'first-party',
    filepath: { regex: '(' },
    allowed: [/$5/],
  });
  expect(error).toContain('Invalid regular expression');
  expect(error).not.toContain('Invalid capture group reference');
});
