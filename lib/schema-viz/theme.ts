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
  canvasBg: "#0d0d0d",
  dotColor: "#1e1e1e",
  nodeBg: "#1a1a1a",
  nodeHeaderBg: "#111111",
  nodeBorder: "#2a2a2a",
  nodeBorderSelected: "#f59e0b",
  nodeBorderNeighbor: "#6366f1",
  nodeBorderDimmed: "#161616",
  nodeOpacityDimmed: 0.12,
  textPrimary: "#e5e5e5",
  textSecondary: "#a3a3a3",
  textType: "#6b7280",
  textDimmed: "#3a3a3a",
  edgeDefault: "#3a3a3a",
  edgeFocused: "#6366f1",
  edgeWidth: 1.5,
  edgeWidthFocused: 2.5,
  glowSelected: "0 0 0 1.5px #f59e0b, 0 0 24px rgba(245,158,11,0.3)",
  glowNeighbor: "0 0 0 1px #6366f1, 0 0 14px rgba(99,102,241,0.25)",
  controlsBg: "#1a1a1a",
  controlsBorder: "#2a2a2a",
  minimapBg: "#111",
  minimapMask: "rgba(0,0,0,0.75)",
};

export const LIGHT_THEME: SchemaVizTheme = {
  id: "light",
  canvasBg: "#f8fafc",
  dotColor: "#e2e8f0",
  nodeBg: "#ffffff",
  nodeHeaderBg: "#f8fafc",
  nodeBorder: "#e2e8f0",
  nodeBorderSelected: "#f59e0b",
  nodeBorderNeighbor: "#6366f1",
  nodeBorderDimmed: "#f1f5f9",
  nodeOpacityDimmed: 0.18,
  textPrimary: "#111827",
  textSecondary: "#6b7280",
  textType: "#9ca3af",
  textDimmed: "#d1d5db",
  edgeDefault: "#cbd5e1",
  edgeFocused: "#6366f1",
  edgeWidth: 1.5,
  edgeWidthFocused: 2.5,
  glowSelected: "0 0 0 1.5px #f59e0b, 0 0 20px rgba(245,158,11,0.2)",
  glowNeighbor: "0 0 0 1px #6366f1, 0 0 12px rgba(99,102,241,0.18)",
  controlsBg: "#ffffff",
  controlsBorder: "#e2e8f0",
  minimapBg: "#f8fafc",
  minimapMask: "rgba(248,250,252,0.7)",
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
