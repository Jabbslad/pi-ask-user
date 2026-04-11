---
name: ask-user
description: Guidelines for using the AskUserQuestion tool to gather user preferences, clarify ambiguity, and make implementation decisions. Load when you need to ask the user structured questions.
---

# AskUserQuestion Usage Guide

## When to Use AskUserQuestion

Use this tool when you need structured user input. It works during normal coding, plan mode, or any context.

**Good use cases:**
1. **Gather user preferences** — "Which CSS framework should we use?" with options like Tailwind, CSS Modules, styled-components
2. **Clarify ambiguous instructions** — "What should happen when a user is not found?" with options like 404 page, redirect, show message
3. **Implementation choices** — "Which auth strategy?" with JWT, session cookies, OAuth options
4. **Offer trade-offs** — "Optimize for speed or readability?" when the approaches differ significantly
5. **Architecture decisions** — "Where should this component live?" with different directory options
6. **Visual comparisons** — "Which layout?" with preview content showing ASCII mockups of each option

**Do NOT use AskUserQuestion when:**
- A simple yes/no suffices — just ask in text
- You can find the answer by reading the code
- You're asking for plan approval — use ExitPlanMode instead
- The question is rhetorical or doesn't need a structured answer
- You're in plan mode and asking "Is the plan ready?" or "Should I proceed?" — use ExitPlanMode

## Plan Mode Note

In plan mode, use AskUserQuestion to clarify requirements or choose between approaches BEFORE writing your plan. This avoids wasted planning effort on the wrong approach.

**Do NOT** use AskUserQuestion to ask about the plan itself (e.g., "Does the plan look good?", "Any changes?"). The user cannot see the plan until you call ExitPlanMode. Use ExitPlanMode for plan approval.

## Features

### "Other" Option (Auto-Added)

Every question automatically includes an "Other (type your own)" option. Do NOT add your own "Other" or "Custom" option — it's already there. When the user selects it, they're prompted for freeform text input.

### Preview Content (Side-by-Side View)

Use the optional `preview` field on options when presenting concrete artifacts that users need to visually compare:
- ASCII mockups of UI layouts or components
- Code snippets showing different implementations
- Diagram variations
- Configuration examples

When any option has a `preview`, the UI switches to a side-by-side layout with options on the left and a preview panel on the right that updates as the user navigates. Previews are only supported for single-select questions (not multiSelect).

### Annotations (Notes)

In single-question preview mode, users can press `n` to add free-text notes to their selection. These notes are returned alongside the answer as `user notes: ...`, giving you richer context about the user's intent. Notes are only available in the preview layout (questions with `preview` fields).

### Tab Navigation (Multi-Question)

When you ask 2-4 questions, the UI shows a tab bar at the top:
- `←/→` arrows to navigate between questions
- Visual indicators showing answered (●) vs unanswered (○) questions
- A Submit tab at the end to review and confirm all answers

### Chat About This

Every question includes a "Chat about this" option below the main choices. If the user selects it, you'll receive a response like:

> The user wants to discuss this question rather than pick an option.
> Ask them what they'd like to clarify.

Respond conversationally — ask what they'd like to discuss or clarify about the options.

### Keyboard Shortcuts

- `↑/↓` — Navigate between options
- `Enter` — Select / submit
- `Esc` — Cancel
- `1`–`9` — Jump directly to an option by number (single-select only)
- `Space` — Toggle checkbox (multi-select only)
- `←/→` — Switch between question tabs (multi-question only)
- `n` — Add notes (preview mode only)

### Auto-Submit

For single-question flows, selecting an option immediately submits the answer — no extra confirmation step needed. Multi-question flows require navigating to the Submit tab.

## Best Practices

- **Batch related questions** — Ask up to 4 questions in one call to reduce back-and-forth
- **Recommend an option** — If you have a preference, make it the first option and add "(Recommended)" to the label
- **Keep labels concise** — 1-5 words per option label. Put details in the description field
- **Write clear descriptions** — Explain trade-offs, implications, and what will happen if chosen
- **Use headers** — Short tags like "Auth", "Framework", "Approach" (max 12 chars)
- **Don't ask what you can discover** — Read the code first. Only ask about things the user knows that the code doesn't tell you
- **Scale to the task** — A vague feature request may need 3-4 questions. A focused bug fix may need none
- **Use previews for visual choices** — When the user needs to compare layouts, code patterns, or configurations side-by-side
- **Keep questions unique** — Each question text must be unique within a call, and option labels must be unique within each question
- **Don't add an "Other" option** — It's automatically appended to every question. Adding your own creates a duplicate

## Examples

### Good Usage — Standard Questions

User says: "Add caching to the API"

```
AskUserQuestion({
  questions: [{
    question: "Which caching strategy should we use?",
    header: "Cache type",
    options: [
      { label: "Redis (Recommended)", description: "Distributed cache, good for multi-server. Requires Redis server." },
      { label: "In-memory LRU", description: "Simple, no dependencies. Lost on restart, per-process only." },
      { label: "File-based", description: "Persists across restarts. Slower, needs disk space management." }
    ]
  }, {
    question: "What should the default cache TTL be?",
    header: "TTL",
    options: [
      { label: "5 minutes", description: "Good for frequently changing data" },
      { label: "1 hour (Recommended)", description: "Balance between freshness and performance" },
      { label: "24 hours", description: "Best performance, data may be stale" }
    ]
  }]
})
```

### Good Usage — Preview Content

User says: "Design the dashboard layout"

```
AskUserQuestion({
  questions: [{
    question: "Which dashboard layout should we use?",
    header: "Layout",
    options: [
      {
        label: "Grid layout",
        description: "Cards arranged in a responsive grid",
        preview: "+------+------+------+\n| Card | Card | Card |\n+------+------+------+\n| Card | Card | Card |\n+------+------+------+\n|    Wide chart       |\n+---------------------+"
      },
      {
        label: "Sidebar + main",
        description: "Fixed sidebar with scrollable main area",
        preview: "+--------+-----------------+\n|  Nav   |                 |\n|        |  Main content   |\n|  Home  |                 |\n|  Dash  |  [widgets]      |\n|  Users |                 |\n+--------+-----------------+"
      },
      {
        label: "Full-width stack",
        description: "Vertically stacked full-width sections",
        preview: "+---------------------+\n|    Header bar       |\n+---------------------+\n|    Stats row        |\n+---------------------+\n|    Chart section    |\n+---------------------+\n|    Data table       |\n+---------------------+"
      }
    ]
  }]
})
```

### Good Usage — Multi-Select

User says: "Set up the project linting"

```
AskUserQuestion({
  questions: [{
    question: "Which linting rules should we enable?",
    header: "Lint rules",
    multiSelect: true,
    options: [
      { label: "No unused vars", description: "Error on declared but unused variables" },
      { label: "Strict equality", description: "Require === instead of ==" },
      { label: "No console", description: "Warn on console.log statements" },
      { label: "Import order", description: "Enforce consistent import sorting" }
    ]
  }]
})
```

### Bad Usage — Don't Do This

```
# Too vague, no real options
AskUserQuestion({
  questions: [{
    question: "How should I implement this?",
    header: "Approach",
    options: [
      { label: "Option A", description: "One way" },
      { label: "Option B", description: "Another way" }
    ]
  }]
})

# Can find the answer by reading code
AskUserQuestion({
  questions: [{
    question: "What testing framework does this project use?",
    ...
  }]
})

# Should be ExitPlanMode, not AskUserQuestion
AskUserQuestion({
  questions: [{
    question: "Does the plan look good?",
    ...
  }]
})

# Duplicate option labels (will be rejected)
AskUserQuestion({
  questions: [{
    question: "Which one?",
    header: "Pick",
    options: [
      { label: "Option A", description: "First" },
      { label: "Option A", description: "Second" }
    ]
  }]
})

# Don't add your own "Other" — it's automatic
AskUserQuestion({
  questions: [{
    question: "Which one?",
    header: "Pick",
    options: [
      { label: "React", description: "..." },
      { label: "Vue", description: "..." },
      { label: "Other", description: "Something else" }  // ← redundant!
    ]
  }]
})
```
