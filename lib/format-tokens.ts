// Token counts: 950, 48.2k, 912.5M. Rollover at 1000 of a unit (999,950 → 1M).
const UNITS = [
  { size: 1_000, suffix: "k" },
  { size: 1_000_000, suffix: "M" },
  { size: 1_000_000_000, suffix: "B" },
  { size: 1_000_000_000_000, suffix: "T" },
] as const;

const tenths = (v: number) => Math.round(v * 10) / 10;

export function formatTokenCount(tokens: number): string {
  if (!(tokens >= 1_000)) return `${tokens}`;
  let label = "";
  for (const { size, suffix } of UNITS) {
    const value = tenths(tokens / size);
    label = `${value}${suffix}`;
    if (value < 1_000) break;
  }
  return label;
}
