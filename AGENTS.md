# AGENTS.md

## Project Overview

This is **pi-ask-user** — an AskUserQuestion tool extension for pi agent. It provides a structured way for the model to ask users multiple-choice questions during any task.

## Architecture

### Structure
```
pi-ask-user/
├── extensions/
│   └── ask-user/
│       └── index.ts          # Extension: AskUserQuestion tool
├── skills/
│   └── ask-user/
│       └── SKILL.md          # Skill: usage guidelines for the model
├── tests/
│   └── ask-user.test.ts      # Unit tests
├── package.json              # Pi package manifest
└── AGENTS.md                 # This file
```

### Key Concepts
- **AskUserQuestion tool**: Model calls it with 1-4 structured questions, each with 2-4 options
- **Single-select**: Uses `ctx.ui.select()` for picking one option
- **Multi-select**: Uses `ctx.ui.custom()` for checkbox-style selection
- **"Other" option**: Auto-added to every question as an escape hatch
- **Companion skill**: `SKILL.md` provides detailed usage guidelines loaded on-demand

### Extension API
- `pi.registerTool()` — AskUserQuestion tool with custom rendering
- `ctx.ui.select()` — Single-select question UI
- `ctx.ui.custom()` — Multi-select checkbox UI
- `ctx.ui.input()` — Freeform "Other" answer input
