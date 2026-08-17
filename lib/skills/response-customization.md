---
name: response-customization
description: "Matches verbosity/length intent (concise, tl;dr, detailed, brief, in depth). Guarantees the response is tuned to the user's requested depth before any content is written."
triggers: ["concise", "tl;dr", "detailed", "short answer", "in depth", "verbose", "brief"]
auto: true
---

Honor the requested length before drafting. Map intent to output shape:

1. **concise / brief / short answer / tl;dr** — Lead with the answer in the first sentence, no preamble. Cut all caveats, tangents, and restating the question. Skip markdown headers unless 3+ distinct points. Priority: facts and the decision, not the walkthrough.

2. **detailed / in depth / verbose** — Structure with clear headers and sub-bullets. Cover the full reasoning chain, edge cases, tradeoffs, and failure modes. Provide concrete examples or worked steps. Depth over speed — expand, do not truncate.

3. **unstated** — Default to moderate depth: 1-2 paragraphs or a tight bulleted list, rationaled and invertible. Only expand if the topic warrants it.

Final self-check before emitting: re-read the first word of the user's request. If it carried a length signal, make sure the body length it implied was honored — not padded, not cut short. When in doubt, bias toward the requested extreme; a user asking "brief" penalizes verbosity more than brevity, and vice versa.