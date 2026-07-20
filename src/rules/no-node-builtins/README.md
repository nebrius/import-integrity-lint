> AI agents: when fixing a violation of this rule, follow the repo's `import-integrity` skill if one is installed, or consult the [skill published with this plugin](https://github.com/nebrius/import-integrity-lint/blob/main/skills/import-integrity/SKILL.md). It covers the correct fix for each violation and which workarounds to avoid.

### When not to use this rule

Don't use this rule if your code runs in Node.js. It's not part of the recommended configuration for that reason — Node.js codebases need their built-ins, and flagging them would be noise.

Enable this rule only in projects that run in non-Node environments. If you have a monorepo with separate Node and non-Node packages (e.g. a Node backend and a browser frontend in different workspace packages), enable this rule only in the non-Node packages.

This rule isn't a good fit for codebases that mix Node and non-Node code within a single package. Next.js is the most common example: server components and route handlers run in Node and can use built-ins, while client components run in the browser and can't, and these can live in sibling files. This rule operates at the package level, so it can't distinguish between them. For Next.js or similar setups, leave this rule disabled.