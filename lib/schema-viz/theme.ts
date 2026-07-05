export interface SchemaVizTheme {
  id: "dark" | "light";

  canvasBg: string;
  dotColor: string;

  nodeBg: string;
  nodeHeaderBg: string;
  nodeBorder: string;
  nodeBorderSelected: string;
  nodeBorderNeighbor: string;
  nodeBorderDimmed: string;
  nodeOpacityDimmed: number;

  textPrimary: string;
  textSecondary: string;
  textType: string;
  textDimmed: string;

  edgeDefault: string;
  edgeFocused: string;
  edgeWidth: number;
  edgeWidthFocused: number;

  glowSelected: string;
  glowNeighbor: string;

  controlsBg: string;
  controlsBorder: string;
  minimapBg: string;
  minimapMask: string;
}

export const DARK_THEME: SchemaVizTheme = {
  id: "dark",
  canvasBg: "#0e0e10",
  dotColor: "#1c1c22",
  nodeBg: "#18181b",
  nodeHeaderBg: "#111114",
  nodeBorder: "#27272a",
  nodeBorderSelected: "#f59e0b",
  nodeBorderNeighbor: "#818cf8",
  nodeBorderDimmed: "#18181b",
  nodeOpacityDimmed: 0.15,
  textPrimary: "#fafafa",
  textSecondary: "#a1a1aa",
  textType: "#71717a",
  textDimmed: "#3f3f46",
  edgeDefault: "#52525b",
  edgeFocused: "#818cf8",
  edgeWidth: 1.5,
  edgeWidthFocused: 2.5,
  glowSelected: "0 0 0 2px #f59e0b, 0 0 20px rgba(245,158,11,0.35)",
  glowNeighbor: "0 0 0 1.5px #818cf8, 0 0 14px rgba(129,140,248,0.3)",
  controlsBg: "#18181b",
  controlsBorder: "#27272a",
  minimapBg: "#111114",
  minimapMask: "rgba(0,0,0,0.7)",
};

export const LIGHT_THEME: SchemaVizTheme = {
  id: "light",
  canvasBg: "#f4f4f5",
  dotColor: "#d4d4d8",
  nodeBg: "#ffffff",
  nodeHeaderBg: "#fafafa",
  nodeBorder: "#d4d4d8",
  nodeBorderSelected: "#d97706",
  nodeBorderNeighbor: "#6366f1",
  nodeBorderDimmed: "#e4e4e7",
  nodeOpacityDimmed: 0.25,
  textPrimary: "#09090b",
  textSecondary: "#3f3f46",
  textType: "#71717a",
  textDimmed: "#a1a1aa",
  edgeDefault: "#a1a1aa",
  edgeFocused: "#6366f1",
  edgeWidth: 1.5,
  edgeWidthFocused: 2.5,
  glowSelected: "0 0 0 2px #d97706, 0 0 16px rgba(217,119,6,0.25)",
  glowNeighbor: "0 0 0 1.5px #6366f1, 0 0 12px rgba(99,102,241,0.2)",
  controlsBg: "#ffffff",
  controlsBorder: "#d4d4d8",
  minimapBg: "#fafafa",
  minimapMask: "rgba(244,244,245,0.75)",
};

const VIZ_THEME_KEY = "leopard-viz-theme";

export function loadVizTheme(): SchemaVizTheme {
  if (typeof window === "undefined") return DARK_THEME;
  return localStorage.getItem(VIZ_THEME_KEY) === "light" ? LIGHT_THEME : DARK_THEME;
}

export function saveVizTheme(t: SchemaVizTheme): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(VIZ_THEME_KEY, t.id);
}
