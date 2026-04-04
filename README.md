# pi-ask-user

AskUserQuestion tool extension for [pi](https://github.com/badlogic/pi-mono) — lets the model ask structured multiple-choice questions during any task.

## Features

- **Structured questions** — 1-4 questions with 2-4 options each
- **Single & multi-select** — Pick one or toggle multiple choices
- **"Other" escape hatch** — Users can always type a custom answer
- **Custom rendering** — Clean TUI display of questions and answers
- **Companion skill** — Detailed usage guidelines for the model

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

### Example

The model might ask:

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

The user sees a selection dialog and picks an option (or types "Other").

## Works with pi-plan-mode

When used alongside [pi-plan-mode](https://github.com/Jabbslad/pi-plan-mode), the model can ask clarifying questions during the planning phase before finalizing the plan.

## Development

```bash
npm install
npm test
```

## License

MIT
