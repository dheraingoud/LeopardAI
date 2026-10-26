/**
 * Marks a generative toolkit entry as a frontend tool whose executor will be
 * supplied by `useLeopardToolOverrides(...)`.
 *
 * `stubTool()` has no runtime implementation. It must be used inside a
 * `"use generative"` toolkit file so the compiler can strip it.
 */
export function stubTool(): never {
  throw new Error(
    "[leopard-ui] stubTool() has no runtime implementation - it marks a " +
      "tool executor that must be supplied via useLeopardToolOverrides(...). Make " +
      'sure this module is compiled as "use generative".',
  );
}
