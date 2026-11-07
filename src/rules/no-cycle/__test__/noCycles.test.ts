import { join } from 'node:path';

import { RuleTester } from '@typescript-eslint/rule-tester';

import { _testOnlyResetCycleMap, noCycle } from '../rule.js';

const PROJECT_ROOT = join(import.meta.dirname, 'project');

const SIMPLE_PACKAGE_DIR = join(PROJECT_ROOT, 'simple');
const FILE_A = join(SIMPLE_PACKAGE_DIR, 'a.ts');

const SIMPLE_SIDE_EFFECT_PACKAGE_DIR = join(PROJECT_ROOT, 'simple-side-effect');
const SIDE_EFFECT_FILE_A = join(SIMPLE_SIDE_EFFECT_PACKAGE_DIR, 'a.ts');

// Fixture for the order-independence regression. The graph contains two
// overlapping cycles that share an edge, which is the minimal case where the
// previous DFS-with-memoization implementation produced different cycle
// attributions depending on which file was linted first:
//
//   a -> b -> c -> a            (small cycle)
//   a -> b -> c -> d -> e -> a  (large cycle, shares a -> b -> c with the above)
//
// All six edges should be flagged on the file they originate from, regardless
// of which file is linted first.
const OVERLAPPING_PACKAGE_DIR = join(PROJECT_ROOT, 'overlapping');
const OVERLAPPING_FILE_A = join(OVERLAPPING_PACKAGE_DIR, 'a.ts');
const OVERLAPPING_FILE_B = join(OVERLAPPING_PACKAGE_DIR, 'b.ts');
const OVERLAPPING_FILE_C = join(OVERLAPPING_PACKAGE_DIR, 'c.ts');
const OVERLAPPING_FILE_D = join(OVERLAPPING_PACKAGE_DIR, 'd.ts');
const OVERLAPPING_FILE_E = join(OVERLAPPING_PACKAGE_DIR, 'e.ts');

beforeEach(() => {
  _testOnlyResetCycleMap();
});

const ruleTester = new RuleTester({
  languageOptions: {
    parserOptions: {
      projectService: {
        allowDefaultProject: [
          'simple/*.ts*',
          'simple-side-effect/*.ts*',
          'overlapping/*.ts*',
        ],
      },
      tsconfigRootDir: PROJECT_ROOT,
    },
  },
});

ruleTester.run('no-cycle', noCycle, {
  valid: [
    {
      code: `export const a = 10;`,
      filename: FILE_A,
      settings: {
        'import-integrity': {
          packageRootDir: SIMPLE_PACKAGE_DIR,
          mode: 'fix',
        },
      },
    },

    // Type-only statements are erased at compile time, so they can't take part
    // in a runtime cycle. The simple fixture is a -> c -> b -> a; each case
    // replaces a's only edge with a type-only statement of a different shape.
    ...[
      `import type { c } from './c';`,
      `import type * as c from './c';`,
      `export type { c } from './c';`,
      `export type * from './c';`,
      `export type * as c from './c';`,
    ].map((statement) => ({
      code: `${statement}

export const a = 10;
`,
      filename: FILE_A,
      settings: {
        'import-integrity': {
          packageRootDir: SIMPLE_PACKAGE_DIR,
          mode: 'fix',
        },
      },
    })),
  ],

  invalid: [
    {
      code: `import { c } from './c';

export const a = 10;

console.log(c);
`,
      filename: FILE_A,
      errors: [{ messageId: 'noCycles' }],
      settings: {
        'import-integrity': {
          packageRootDir: SIMPLE_PACKAGE_DIR,
          mode: 'fix',
        },
      },
    },
    {
      code: `export * from './c';

export const a = 10;

console.log(c);
`,
      filename: FILE_A,
      errors: [{ messageId: 'noCycles' }],
      settings: {
        'import-integrity': {
          packageRootDir: SIMPLE_PACKAGE_DIR,
          mode: 'fix',
        },
      },
    },
    {
      code: `import { a } from './a';

export const a = 10;`,
      filename: FILE_A,
      errors: [{ messageId: 'noCycles' }],
      settings: {
        'import-integrity': {
          packageRootDir: SIMPLE_PACKAGE_DIR,
          mode: 'fix',
        },
      },
    },

    // Side-effect imports (`import 'foo'` with no specifiers) participate in
    // cycle detection too, since they can deadlock or mutate shared state at
    // load time. This mirrors the simple a -> c -> b -> a fixture above but
    // uses side-effect imports for every edge.
    {
      code: `import './c';

export const a = 10;
`,
      filename: SIDE_EFFECT_FILE_A,
      errors: [{ messageId: 'noCycles' }],
      settings: {
        'import-integrity': {
          packageRootDir: SIMPLE_SIDE_EFFECT_PACKAGE_DIR,
          mode: 'fix',
        },
      },
    },

    // Regression: order-independence on overlapping cycles. Each of the
    // following cases lints a different starting file in the same graph.
    // Under the previous DFS-with-memoization implementation, picking a file
    // like c.ts as the DFS root caused the c -> d edge to be silently dropped
    // because d, e, and a got memoized via the small cycle's traversal first.
    // The SCC-based detector must report the correct edges regardless of root.

    // Lint a.ts: a -> b is the only outgoing edge in the cycle.
    {
      code: `import { b } from './b';

export const a = 10;

console.log(b);
`,
      filename: OVERLAPPING_FILE_A,
      errors: [{ messageId: 'noCycles' }],
      settings: {
        'import-integrity': {
          packageRootDir: OVERLAPPING_PACKAGE_DIR,
          mode: 'fix',
        },
      },
    },
    // Lint b.ts: b -> c.
    {
      code: `import { c } from './c';

export const b = 10;

console.log(c);
`,
      filename: OVERLAPPING_FILE_B,
      errors: [{ messageId: 'noCycles' }],
      settings: {
        'import-integrity': {
          packageRootDir: OVERLAPPING_PACKAGE_DIR,
          mode: 'fix',
        },
      },
    },
    // Lint c.ts: BOTH c -> a and c -> d must be reported. This is the case
    // that used to under-report (only c -> a was flagged) when c was the DFS
    // root.
    {
      code: `import { a } from './a';
import { d } from './d';

export const c = 10;

console.log(a, d);
`,
      filename: OVERLAPPING_FILE_C,
      errors: [{ messageId: 'noCycles' }, { messageId: 'noCycles' }],
      settings: {
        'import-integrity': {
          packageRootDir: OVERLAPPING_PACKAGE_DIR,
          mode: 'fix',
        },
      },
    },
    // Lint d.ts: d -> e.
    {
      code: `import { e } from './e';

export const d = 10;

console.log(e);
`,
      filename: OVERLAPPING_FILE_D,
      errors: [{ messageId: 'noCycles' }],
      settings: {
        'import-integrity': {
          packageRootDir: OVERLAPPING_PACKAGE_DIR,
          mode: 'fix',
        },
      },
    },
    // Lint e.ts: e -> a.
    {
      code: `import { a } from './a';

export const e = 10;

console.log(a);
`,
      filename: OVERLAPPING_FILE_E,
      errors: [{ messageId: 'noCycles' }],
      settings: {
        'import-integrity': {
          packageRootDir: OVERLAPPING_PACKAGE_DIR,
          mode: 'fix',
        },
      },
    },
  ],
});
