# AGENTS.md

This file provides guidance for AI coding agents working in this repository.

## Build, Test, and Lint Commands

```bash
# Build the TypeScript project
npm run build

# Run tests with coverage
npm run test

# Run linting (chains lint:eslint then lint:oxlint; lint:eslint:fix is also available)
npm run lint

# Format code with Prettier
npm run format
```

## Project Architecture

### Core Algorithm

The plugin uses a pipelined algorithm for analyzing imports/exports. See the [Algorithm section in README.md](README.md#algorithm) for detailed phase descriptions.

**Implementation location:** `src/module/`

- `computeBaseInfo.ts` - Phase 1: per-file AST analysis using oxc-parser
- `computeResolvedInfo.ts` - Phase 2: module specifier resolution
- `computeAnalyzedInfo.ts` - Phase 3: import graph analysis
- `computeRepoInfo.ts` - Phase 4: repo / monorepo-wide package discovery
- `module.ts` - Orchestrates the phases and manages caching

### Caching Behavior

See [mode configuration in README.md](README.md#mode) for details on caching modes.

**Important for development:**

- Caching is disabled when running `npm run lint` (uses `one-shot` mode via auto-detection)
- Caching is enabled but file watching is disabled in tests (tests explicitly set `mode: 'fix'` in settings)
- The `fix` and `editor` modes enable caching for file updates, but only `editor` mode enables file watching

### Project Structure

```
src/
├── module/          # Core algorithm implementation (pipeline + orchestrator)
├── rules/           # ESLint rule implementations (one directory per rule)
├── settings/        # Configuration parsing and validation
├── types/           # TypeScript type definitions for each phase
│   ├── base.ts      # Types for Phase 1
│   ├── resolved.ts  # Types for Phase 2
│   └── analyzed.ts  # Types for Phase 3
└── util/            # Shared utilities
```

The canonical list of rules lives in [src/plugin.ts](src/plugin.ts) and is documented in [README.md#rules](README.md#rules). Each rule directory is named after its published rule name (e.g. `no-cycle/`, `no-unused-exports/`) and contains a `rule.ts` implementation, a `README.md`, and an `__test__/` directory.

### Testing Patterns

- Tests are located in `__test__` directories alongside the code they test
- Rule tests use `@typescript-eslint/rule-tester`
- Test projects for integration tests are in `__test__/project/` subdirectories

### Key Dependencies

- **oxc-parser**: Rust-based JavaScript/TypeScript parser for performance
- **zod v4**: Schema validation with native `toJSONSchema()` for ESLint rule schemas
- **@typescript-eslint/utils**: ESLint rule creation utilities

## Common Development Tasks

### Adding a New Rule

See [Creating new rules](README.md#creating-new-rules) for detailed documentation.

1. Create a new directory under `src/rules/` named after the published rule name (e.g. `src/rules/no-foo-bar/`)
2. Implement the rule in `rule.ts` using `createRule` from `src/rules/util.ts`
3. Use `getESMInfo(context)` to access parsed import/export information
4. Add tests in `__test__/` subdirectory:
   - Create a `project/` directory with sample source files for the rule to analyze
   - Tests point `rootDir` to this project directory (see `TEST_PROJECT_DIR` constant)
   - Test cases reference files within that project (e.g., `FILE_A`, `FILE_B`)
5. Create a README.md in the rule directory following the style of other rules
6. Wire the rule up in `src/plugin.ts`:
   - Register it in `plugin.rules`
   - Add a severity entry in **either** `recommendedConfig.rules` **or** `monorepoRecommendedConfig.rules` — these two configs are mutually exclusive (a rule belongs to one or the other, not both). Single-package rules go in `recommended`; monorepo-specific rules (like `no-unused-package-exports`) go in `monorepoRecommended`.
   - Always add an `'off'` entry in `offConfig.rules` — this config must include **every** rule.
7. Add the rule to the list of rules in [Rules](README.md#rules)

### Working with Function Overloads

TypeScript function overloads are de-duplicated in `computeBaseInfo.ts`. Only the final implementation (not the overload signatures) is tracked as an export.

### Schema Validation

Use zod v4's native `schema.toJSONSchema()` for ESLint rule option schemas. Accept RegExp values with `z.custom<RegExp>(isRegExp)` (`isRegExp` from `node:util/types`), never `z.instanceof(RegExp)`: ESLint `structuredClone`s rule options, and under Jest the clone comes from a different realm, where `instanceof` fails. JSON Schema can't represent a RegExp, so for those schemas use the `{ unrepresentable: 'any' }` option.
