---
name: mermaid-gen
description: "Guarantees parser-safe mermaid generation: correct keyword headers, escaped labels, and complete single fences so the client never surfaces a syntax error."
triggers: ["mermaid", "flowchart", "sequence diagram", "er diagram", "gantt", "pie chart"]
auto: true
---

One fence per diagram: exactly ONE ```mermaid block, plain keyword header with no label text. Never split a diagram across fences; never truncate a fence — a broken fence trips the client parser like a syntax error.

Stick to safe directives: flowchart, sequenceDiagram, classDiagram, erDiagram, gantt, pie. Avoid stateDiagram, gitGraph, journey, mindmap, C4Context.

FLOWCHART: shapes `id[text]` `id(text)` `id{text}` `id[(text)]` `id((text))`. Quote/backtick-escape problem characters. Capitalize the word END in nodes. Never start a label with a bare `o` or `x`.

SEQUENCE: declare actors (`participant Alice as A`). `->>` solid, `-->` dotted. Escape `;` as `#59;`, emojis as numeric entities (`#9829;`). Wrap reserved "end" in quotes/brackets. Blocks: `loop/end`, `alt/else/end`, `Note right of X:`.

CLASS: ids alphanumeric + underscores + dashes only — no spaces. Members `BankAccount : +String owner`; `()` = method; tildes, never commas, in generics.

GANTT: `section Name:` before tasks; `%%` comments alone on a line; valid duration units `ms,s,m,h,d,w,M,y`.

ER: spaces only inside double quotes; attribute comments must not contain double quotes.

PIE: values positive, >0, up to 2 decimals; labels in double quotes.

COLORING — ALWAYS render multi-color, NEVER monochrome. Give each distinct node
class its own fill via `classDef`, and ALWAYS pair a fill with a text color that
keeps strong contrast (light text on dark fills, dark text on light fills). The
client renders hues as-is, so if text and fill mix (e.g. `color:#404040` on
`fill:#3f3f46`) the label becomes unreadable — that is the #1 failure. Use only
these APPROVED fill→label pairs:

  #7c2d12  (deep amber)  →  text #ffedd5        #fde68a  (pale amber) → text #7c2d12
  #166534  (deep green)  →  text #dcfce7        #bbf7d0  (pale green) → text #14532d
  #3f3f46  (dark zinc)   →  text #fafafa        #e5e7eb  (light zinc) → text #111827
  #1e3a8a  (deep indigo) →  text #e0e7ff        #c7d2fe  (pale indigo) → text #312e81
  #7f1d1d  (deep red)    →  text #fee2e2        #fecaca  (pale rose)  → text #881337
  #713f12  (deep brown)  →  text #fef3c7        #fef3c7  (pale amber-note) → text #78350f

Dark app mode: prefer the LEFT (deep fill / light label) pair. Light app mode:
prefer the RIGHT (pale fill / dark label) pair. Then map semantic roles —
e.g. source/destination amber, process green, decision indigo, error/backedge
red, note brown — and give each role ONE classDef so similar nodes share a hue:

    classDef src fill:#7c2d12,color:#ffedd5,stroke:#f59e0b
    classDef proc fill:#166534,color:#dcfce7,stroke:#4ade80
    classDef dec fill:#1e3a8a,color:#e0e7ff,stroke:#818cf8
    classDef err fill:#7f1d1d,color:#fee2e2,stroke:#f87171
    class A,B src
    class C,D proc

Keep edges (link text) a single legible tone and never let an edge color equal
the page text color. Gantt: assign each `section` a distinct approved fill and
keep task labels white-on-fill only when the fill is a dark pair. ER: entity
fill + attribute text follow the same pair table. If you are unsure whether a
hue keeps contrast against its fill, fall back to `fill:#7c2d12,color:#ffedd5`
(dark) or `fill:#fde68a,color:#7c2d12` (light) — those two are always safe. Never
use bare `fill:X` without a matching `color:` label.