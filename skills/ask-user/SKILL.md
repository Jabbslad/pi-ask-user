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

**Do NOT use AskUserQuestion when:**
- A simple yes/no suffices — just ask in text
- You can find the answer by reading the code
- You're asking for plan approval — use ExitPlanMode instead
- The question is rhetorical or doesn't need a structured answer
- You're in plan mode and asking "Is the plan ready?" or "Should I proceed?" — use ExitPlanMode

## Plan Mode Note

In plan mode, use AskUserQuestion to clarify requirements or choose between approaches BEFORE writing your plan. This avoids wasted planning effort on the wrong approach.

**Do NOT** use AskUserQuestion to ask about the plan itself (e.g., "Does the plan look good?", "Any changes?"). The user cannot see the plan until you call ExitPlanMode. Use ExitPlanMode for plan approval.

## Best Practices

- **Batch related questions** — Ask up to 4 questions in one call to reduce back-and-forth
- **Recommend an option** — If you have a preference, make it the first option and add "(Recommended)" to the label
- **Keep labels concise** — 1-5 words per option label. Put details in the description field
- **Write clear descriptions** — Explain trade-offs, implications, and what will happen if chosen
- **Use headers** — Short tags like "Auth", "Framework", "Approach" (max 12 chars)
- **Don't ask what you can discover** — Read the code first. Only ask about things the user knows that the code doesn't tell you
- **Scale to the task** — A vague feature request may need 3-4 questions. A focused bug fix may need none

## Examples

### Good Usage

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
```
