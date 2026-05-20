---
layout: home

hero:
  name: Import Integrity
  text: Helps keep imports correct and tidy
  tagline: A real codebase carries a lot of intent in how files are organized, i.e. what's reusable, what shouldn't be mixed, and so on. But day-to-day, that intent erodes. Import Integrity is a plugin for ESLint/Oxlint that analyzes imports and exports through your codebase. It flags dead exports, broken boundaries, and other issues that accumulate over time.
  actions:
    - theme: brand
      text: Quickstart
      link: /guide/quickstart
    - theme: alt
      text: View Rules
      link: /rules

features:
  - icon: 👻
    title: Finds dead exports
    details: Dead code brings no value, but still incurs maintenance costs. Import Integrity tracks which exports are actually used across files and packages, and flags ones that should be removed.
  - icon: 🗂️
    title: Keeps your code organized
    details: Every codebase starts with a clear shape, but gradually loses it. Define your structural rules once, and let your linter ensure that structure as the codebase grows.
  - icon: 📦
    title: Built for monorepos
    details: Per-package lint setups miss cross-package usage, or lack thereof. Root-level setups don't understand boundaries between packages. Import Integrity understands the whole picture.
  - icon: 🤖
    title: Guardrails for agentic coding
    details: Rules in AGENTS.md aren't always followed, and more rules bloat context. Encoding your structure in lint rules provides consistent enforcement and keeps agent contexts minimal.
---
