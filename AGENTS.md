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
- **Single-select**: Uses `ctx.ui.custom()` with cursor navigation and auto-submit
- **Multi-select**: Uses `ctx.ui.custom()` for checkbox-style selection with Space to toggle
- **Preview mode**: Side-by-side layout with options on the left, preview panel on the right (single-select only, when options have `preview` fields)
- **Tab navigation**: Multi-question flows get a tab bar with ←/→ navigation and a Submit review step
- **"Other" option**: Auto-added to every question as an escape hatch, prompts for freeform input via `ctx.ui.input()`
- **"Chat about this"**: Always-present option that signals the user wants to discuss rather than pick
- **Annotations**: In preview mode, users can add free-text notes (`n` key) returned alongside their answer
- **Companion skill**: `SKILL.md` provides detailed usage guidelines loaded on-demand

### UI Flows

The extension has three distinct UI flows based on question count and type:

1. **Single question, single-select** — Options + Other + Chat about this. Auto-submits on selection.
2. **Single question, multi-select** — Checkboxes + Other. Space to toggle, Enter to submit.
3. **Multi-question (2-4)** — Tab bar with per-question UIs + Submit review tab. Each question renders as single-select or multi-select depending on `multiSelect` flag.

Preview mode activates within flows 1 and 3 when any option has a `preview` field.

### Extension API
- `pi.registerTool()` — Registers AskUserQuestion with custom `renderCall` and `renderResult`
- `ctx.ui.custom()` — All interactive UI (single-select, multi-select, preview, tabbed)
- `ctx.ui.input()` — Freeform text input for "Other" answers

### Exported Functions
- `default` — Extension entry point (`askUserExtension`), registers the tool
- `validateUniqueness()` — Checks that question texts and option labels are unique (also used by tests)
