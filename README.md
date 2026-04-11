# pi-ask-user

AskUserQuestion tool extension for [pi](https://github.com/badlogic/pi-mono) — lets the model ask structured multiple-choice questions during any task.

## Features

- **Structured questions** — 1-4 questions with 2-4 options each
- **Single & multi-select** — Pick one or toggle multiple choices
- **Preview mode** — Side-by-side layout with a live preview panel for visual comparisons (ASCII mockups, code snippets, diagrams)
- **Tab navigation** — Multi-question flows get a tab bar with ←/→ navigation and a submit review step
- **"Other" escape hatch** — Auto-added to every question; prompts for freeform text input
- **"Chat about this"** — Always-present option for when the user wants to discuss rather than pick
- **Annotations** — Users can attach free-text notes to their selection in preview mode
- **Keyboard shortcuts** — Number keys to jump to options, Space to toggle checkboxes, `n` for notes
- **Custom rendering** — Clean TUI display of questions and answers in the pi interface
- **Companion skill** — Detailed usage guidelines the model can load on demand

## Installation

Add to your pi settings:

```json
{
  "packages": ["git:github.com/Jabbslad/pi-ask-user"]
}
```

Or for local development:

```json
{
  "extensions": ["/path/to/pi-ask-user/extensions"],
  "skills": ["/path/to/pi-ask-user/skills"]
}
```

## Usage

The model calls `AskUserQuestion` automatically when it needs user input. You can also reference the companion skill for detailed guidelines:

```
/skill:ask-user
```

### Examples

Single-select with a recommendation:

```
AskUserQuestion({
  questions: [{
    question: "Which auth strategy should we use?",
    header: "Auth",
    options: [
      { label: "JWT (Recommended)", description: "Stateless tokens, good for APIs" },
      { label: "Session cookies", description: "Server-side sessions, simpler for web apps" },
      { label: "OAuth 2.0", description: "Delegated auth, good for third-party login" }
    ]
  }]
})
```

Preview mode for visual comparison:

```
AskUserQuestion({
  questions: [{
    question: "Which dashboard layout?",
    header: "Layout",
    options: [
      { label: "Grid", description: "Responsive card grid",
        preview: "+------+------+\n| Card | Card |\n+------+------+" },
      { label: "Sidebar", description: "Fixed sidebar + main",
        preview: "+-----+----------+\n| Nav | Content  |\n+-----+----------+" }
    ]
  }]
})
```

Multi-select:

```
AskUserQuestion({
  questions: [{
    question: "Which linting rules should we enable?",
    header: "Lint rules",
    multiSelect: true,
    options: [
      { label: "No unused vars", description: "Error on unused variables" },
      { label: "Strict equality", description: "Require === instead of ==" },
      { label: "Import order", description: "Enforce consistent import sorting" }
    ]
  }]
})
```

The user sees a TUI dialog and picks options, types "Other", or selects "Chat about this" to discuss further.

## Works with pi-plan-mode

When used alongside [pi-plan-mode](https://github.com/Jabbslad/pi-plan-mode), the model can ask clarifying questions during the planning phase before finalizing the plan.

## Development

```bash
npm install
npm test
```

## License

MIT
