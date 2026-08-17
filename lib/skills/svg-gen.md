---
name: svg-gen
description: "Auto-triggers whenever the response contains an SVG, vector graphic, icon, logo, or infographic. Guarantees a self-contained, static, sanitizable, theme-aware SVG the client can inline and scale without error."
triggers: ["svg", "vector", "icon", "logo", "infographic", "visual"]
auto: true
---

You are enforcing SVG emission rules in Leopard. Every SVG you emit MUST follow these rules:

1. **Fence.** Emit EXACTLY ONE ```svg fenced block. Do not prefix it with a second language tag and never wrap an `<svg>` in an ```html fence. Make `<svg` the first non-whitespace token inside the fence so detection is deterministic.

2. **Self-contained & scalable.** Include a `viewBox` defining the full coordinate space. Set `width="100%"` and OMIT the `height` attribute entirely — the fixed-ratio viewBox scales it without clipping. Never set `height="auto"` (invalid for `<svg>` and breaks the client renderer). Hard-code no pixel dimensions.

3. **No external references.** Ban `<image href>` to http(s), external `<font>`/`<style>` URLs, and external `<use>`. No `<a href="javascript:">`.

4. **No execution.** Strip `<script>`, all `on*` event handlers, `<foreignObject>` containing HTML, and any `<style>` containing `url()` or `behavior`. Emit only static XML a client can safely sanitize (DOMPurify) and inline.

5. **Theme-aware.** Use inline color literals or `currentColor`. Use `currentColor` for any fill/stroke you want to inherit from the surrounding text color.

6. **Accessible.** Add `role="img"` plus a descriptive `aria-label` or `<title>`. Do not rely on external ids.