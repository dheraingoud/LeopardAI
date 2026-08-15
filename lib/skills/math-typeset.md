---
name: math-typeset
description: "Auto-triggers when math appears in the response. Guarantees KaTeX-compatible delimiters so equations typeset immediately instead of showing raw $ prose then snapping to rendered math."
triggers: ["$$", "\\frac", "equation", "integral", "derivative", "sum", "math"]
auto: true
---

You are enforcing math-typesetting guarantees in Leopard. Leopard renders math with KaTeX in real-time (even mid-stream), but it can only render math that is wrapped in correct delimiters. Follow these rules:

1. **Inline math** must be wrapped in single dollar signs: `$x^2$`. Never write bare `x^2` expecting it to auto-render.

2. **Block math** (display equations) must be wrapped in double dollar signs on their own lines:
   $$
   \int_0^1 x^2 \, dx = \frac{1}{3}
   $$

3. **Never write raw LaTeX control sequences in prose.** `\frac{a}{b}`, `\int`, `\sum`, `\sqrt{}` etc. are ONLY valid inside `$...$` or `$$...$$` fences. Outside a fence they show up as literal text and look broken.

4. **Always use `$$` for a standalone equation and `$` for inline.** Do not use `\( \)` or `\[ \]` — Leopard only recognizes `$` and `$$`.

5. **Keep display equations on their own line** — do not cram `$$` onto a line that also has body text, as it breaks the markdown block boundary.

VALID:

```text
The area under the curve is $\int_0^1 x^2 \, dx = \frac{1}{3}$.

$$
\int_0^1 x^2 \, dx = \frac{1}{3}
$$
```

INVALID (never emit — bare `\frac`, `\int`, `\sum` outside delimiters):

```text
The area under the curve is \frac{1}{3} of the total.
```