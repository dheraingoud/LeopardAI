---
name: diagram-clarity
description: "Auto-triggers whenever the response contains a diagram (flowchart, sequence, class, state, gantt, pie). Guarantees well-formed single-fence mermaid so the client never surfaces a syntax error."
triggers: ["```mermaid", "diagram", "flowchart", "sequence diagram", "class diagram", "ER", "gantt"]
auto: true
---

You are enforcing diagram rendering guarantees in Leopard. There are TWO diagram renderers — pick deliberately, never mix them:

- **```mermaid** — the default for ALL rich diagrams (flowcharts with decisions, sequence, class, state, gantt, pie, ER). Use it whenever the diagram has branching, labels on edges, or any mermaid-native type.
- **```flow** — leopard's minimal node→edge graph. Use ONLY for a simple linear/fan-out pipeline of named steps with NO decision branches (e.g. build → test → deploy, or a master → workers fan-out). One edge per line: `a -> b`. Optional node state: `a[done]`, `b[active]`, `c[pending]`. No edge labels, no shapes, no prose inside. If you need anything more, use mermaid.

Every mermaid diagram you emit MUST follow these rules:

1. **One fence, one diagram.** A diagram is EXACTLY ONE ```mermaid fenced block. Never wrap a diagram in prose mid-output, never split it across multiple fences. Do NOT emit inline `mermaid:` plus a separate code fence.

2. **No nested code in labels.** Node labels and edge labels must be plain text. Never put a markdown code span (backticks) inside a label — it breaks the parser. Use `Node("plain text")` only.

3. **Angle-bracket edge labels must be quoted** when they contain spaces or punctuation: use `-->|"with spaces"|` not `-->|with spaces|`.

4. **Escaping:** Backslash-escape any literal `{`, `}`, `[`, `]`, or `|` that appears in a label. Avoid `@`, `#`, and unpaired quotes in labels entirely.

5. **Wide diagrams:** prefer `flowchart LR` (left-to-right) for wide diagrams so they fit the viewport; use `TD` only for narrow, top-down flows.

6. **No semantic errors:** every node referenced in an edge must be declared before use (`A --> B` requires `A` and `B` to be defined). Reuse the same node id instead of re-declaring it.

7. **Leaf text is short.** Keep labels under ~12 words. Long prose belongs in body text below the diagram, not inside nodes.

A valid example:

```mermaid
flowchart LR
  A[Load config] --> B{Key present?}
  B -->|yes| C[Use cached value]
  B -->|no| D[Fetch remote]
```

An INVALID example (never emit this — stray backticks + undeclared node + unquoted edge label):

```mermaid
flowchart TD
  Start --> Process `data`
  Process --> |not ready| End
```