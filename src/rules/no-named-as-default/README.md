# import-integrity/no-named-as-default

Ensures that default imports do not have the same name as a named export in the file being imported from.

> AI agents: when fixing a violation of this rule, follow the repo's `import-integrity` skill if one is installed, or consult the [skill published with this plugin](https://github.com/nebrius/import-integrity-lint/blob/main/skills/import-integrity/SKILL.md). It covers the correct fix for each violation and which workarounds to avoid.

## Rule Details

If a default import or reexport is given the same name as a named export in the file being imported from, one of two things is likely happening: the developer made a mistake and meant to import the named export, or the developer is intentionally aliasing the default to shadow the named export and create confusion for future readers. Either way, the result is harder to read code.

## Examples

The examples below assume:

```js
// a.ts
export const a = 10;
export default 20;
```

### Incorrect

```js
// b.ts
import a from './a';
```

```js
// c.ts
export { default as a } from './a';
```

### Correct

```js
// b.ts
import aDefault from './a';
```

```js
// c.ts
export { default as aDefault } from './a';
```

Any name that doesn't collide with a named export from the imported file works. `aDefault` is just one option.

## Configuration

### Options

This rule has no options.

### When not to use this rule

We don't recommend disabling this rule. If you have a legitimate need to import the default with the same name as a named export, you can suppress the warning for the specific line with a disable comment, but the resulting code will be harder for others to read.