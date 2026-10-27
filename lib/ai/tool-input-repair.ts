// Tool-input salvage.
//
// A tool call with invalid arguments is not a failed turn — but the SDK marks
// the call invalid and the user sees an error card. These repairs turn the
// mangled shapes models actually emit into inputs that validate, so the call
// succeeds instead of erroring. Each repair returns the fixed input, or null
// when the input is already valid (nothing to change).
//
// The SDK runs a repair only after NoSuchToolError / InvalidToolInputError,
// then RE-VALIDATES the returned input — so a repair that returns unchanged
// garbage would fail again. Every repair below therefore returns null unless
// it can produce an input that satisfies the tool's own schema.
import { CHART_FORMS } from "@/components/chat/leopard/charts/registry";
import { widgetSchema } from "@/lib/ai/widget-schema";

const WIDGET_TYPES = new Set([
  "chart",
  "table",
  "stat",
  "progress",
  "form",
  "gallery",
  "code",
  "diagram",
  "map",
]);

const CHART_FORM_SET = new Set<string>(CHART_FORMS);

const ARTIFACT_KINDS = new Set(["text", "file", "code", "sheet"]);

const FORM_FIELD_TYPES = new Set([
  "text",
  "number",
  "email",
  "select",
  "textarea",
]);

const STAT_TRENDS = new Set(["up", "down", "neutral"]);

const PROGRESS_STATUSES = new Set(["active", "complete", "error"]);

const parseMaybeJson = (v: unknown): unknown => {
  if (typeof v !== "string") return v;
  const trimmed = v.trim();
  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) return v;
  try {
    return JSON.parse(trimmed);
  } catch {
    return v;
  }
};

const asRecord = (v: unknown): Record<string, unknown> | null => {
  const parsed = parseMaybeJson(v);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
  return parsed as Record<string, unknown>;
};

/** Coerce a value into an array of non-empty strings. */
const asStringArray = (v: unknown): string[] => {
  const parsed = parseMaybeJson(v);
  if (Array.isArray(parsed)) {
    return parsed
      .map((entry) => {
        if (typeof entry === "string") return entry;
        if (typeof entry === "number" || typeof entry === "boolean") return String(entry);
        if (entry && typeof entry === "object") {
          const label = (entry as { label?: unknown }).label;
          if (typeof label === "string") return label;
          const value = (entry as { value?: unknown }).value;
          if (typeof value === "string" || typeof value === "number") return String(value);
        }
        return "";
      })
      .filter((s) => s.length > 0);
  }
  if (typeof parsed === "string" && parsed.trim()) return [parsed.trim()];
  return [];
};

const differs = (before: unknown, after: unknown): boolean =>
  JSON.stringify(before) !== JSON.stringify(after);

/** A finite number, or null when the value cannot be read as one. */
const asNumber = (v: unknown): number | null => {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
};

/** A non-empty string, or null. */
const asText = (v: unknown): string | null =>
  typeof v === "string" && v.trim() !== "" ? v : null;

/** An absolute http(s) URL, or null. */
const asUrl = (v: unknown): string | null => {
  const s = asText(v);
  if (!s) return null;
  try {
    const u = new URL(s);
    return u.protocol === "http:" || u.protocol === "https:" ? s : null;
  } catch {
    return null;
  }
};

const asRecordList = (v: unknown): Array<Record<string, unknown>> => {
  const parsed = parseMaybeJson(v);
  if (!Array.isArray(parsed)) return [];
  return parsed.filter(
    (e): e is Record<string, unknown> =>
      !!e && typeof e === "object" && !Array.isArray(e),
  );
};

/** A table row must be an array of strings/numbers. */
const normalizeTableRow = (row: unknown): (string | number)[] => {
  if (Array.isArray(row)) {
    return row.map((cell) =>
      typeof cell === "string" || typeof cell === "number"
        ? cell
        : cell === null || cell === undefined
          ? ""
          : typeof cell === "boolean"
            ? String(cell)
            : JSON.stringify(cell),
    );
  }
  if (row && typeof row === "object") {
    return Object.values(row as Record<string, unknown>).map((cell) =>
      typeof cell === "string" || typeof cell === "number"
        ? cell
        : cell === null || cell === undefined
          ? ""
          : String(cell),
    );
  }
  return row === null || row === undefined ? [] : [String(row)];
};

/** webSearch: allowed_domains and blocked_domains are mutually exclusive. */
export const repairWebSearchInput = (
  input: unknown,
): Record<string, unknown> | null => {
  const rec = asRecord(input);
  if (!rec) return null;
  const next = { ...rec };
  if (next.allowed_domains !== undefined && next.blocked_domains !== undefined) {
    delete next.blocked_domains;
  }
  if (next.allowed_domains !== undefined) {
    const list = asStringArray(next.allowed_domains);
    if (list.length === 0) delete next.allowed_domains;
    else next.allowed_domains = list;
  }
  if (next.blocked_domains !== undefined) {
    const list = asStringArray(next.blocked_domains);
    if (list.length === 0) delete next.blocked_domains;
    else next.blocked_domains = list;
  }
  if (typeof next.query !== "string" || next.query.trim() === "") {
    const q = asStringArray(next.query)[0];
    if (!q) return null;
    next.query = q;
  }
  return differs(rec, next) ? next : null;
};

/** askUser: options must be 2-4 strings. */
export const repairAskUserInput = (
  input: unknown,
): Record<string, unknown> | null => {
  const rec = asRecord(input);
  if (!rec) return null;
  const next = { ...rec };
  if (typeof next.question !== "string" || next.question.trim() === "") {
    const q = asStringArray(next.question)[0];
    if (!q) return null;
    next.question = q;
  }
  const options = asStringArray(next.options);
  if (options.length < 2) return null;
  next.options = options.slice(0, 4);
  return differs(rec, next) ? next : null;
};

/** createDocument: kind must be an artifact kind, title must be a string. */
export const repairCreateDocumentInput = (
  input: unknown,
): Record<string, unknown> | null => {
  const rec = asRecord(input);
  if (!rec) return null;
  const next = { ...rec };
  if (typeof next.title !== "string" || next.title.trim() === "") {
    const t = asStringArray(next.title)[0];
    if (!t) return null;
    next.title = t;
  }
  if (typeof next.kind !== "string" || !ARTIFACT_KINDS.has(next.kind)) {
    const raw = String(next.kind ?? "").toLowerCase();
    next.kind = ARTIFACT_KINDS.has(raw)
      ? raw
      : raw.includes("sheet") || raw.includes("csv") || raw.includes("table")
        ? "sheet"
        : raw.includes("code") || raw.includes("script")
          ? "code"
          : raw.includes("text") || raw.includes("doc") || raw.includes("essay")
            ? "text"
            : "file";
  }
  return differs(rec, next) ? next : null;
};

/**
 * The widget type a payload describes, read from its own fields.
 *
 * The discriminator is what the schema dispatches on, so a call without it
 * cannot be routed to any branch — the union fails with "no matching
 * discriminator" before any field is looked at (live 2026-10-28: the model
 * emitted {title, columns, rows} and the call died). The payload's fields
 * still say which widget it is.
 */
const guessWidgetTypeFromShape = (rec: Record<string, unknown>): string => {
  if (rec.places !== undefined) return "map";
  if (rec.images !== undefined) return "gallery";
  if (rec.fields !== undefined) return "form";
  if (rec.columns !== undefined || rec.rows !== undefined) return "table";
  if (
    rec.chartType !== undefined ||
    rec.data !== undefined ||
    rec.series !== undefined ||
    rec.groups !== undefined ||
    rec.matrix !== undefined ||
    rec.scatter !== undefined ||
    rec.bins !== undefined
  ) {
    return "chart";
  }
  if (rec.code !== undefined) {
    return typeof rec.language === "string" ? "code" : "diagram";
  }
  if (rec.label !== undefined && rec.value !== undefined) {
    return rec.status !== undefined ? "progress" : "stat";
  }
  return "";
};

/** renderWidget: rebuild the arguments into a shape the widget schema accepts. */
export const repairRenderWidgetInput = (
  input: unknown,
): Record<string, unknown> | null => {
  const rec = asRecord(input);
  if (!rec) return null;
  const next = { ...rec };
  // `type` is the model's other spelling of the discriminator — the schema
  // only reads `_type`, so a payload carrying `type` alone has no branch.
  const type =
    typeof next._type === "string" && next._type.trim() !== ""
      ? next._type
      : typeof next.type === "string" && next.type.trim() !== ""
        ? next.type
        : "";
  if (next._type !== type) {
    const raw = type.toLowerCase();
    const guess = WIDGET_TYPES.has(raw)
      ? raw
      : raw.includes("chart") || raw.includes("graph") || raw.includes("plot")
        ? "chart"
        : raw.includes("table")
          ? "table"
          : raw.includes("stat") || raw.includes("metric") || raw.includes("kpi")
            ? "stat"
            : raw.includes("progress")
              ? "progress"
              : raw.includes("form")
                ? "form"
                : raw.includes("gallery") || raw.includes("image")
                  ? "gallery"
                  : raw.includes("code") || raw.includes("snippet")
                    ? "code"
                    : raw.includes("diagram") || raw.includes("mermaid")
                      ? "diagram"
                      : raw.includes("map")
                        ? "map"
                        : guessWidgetTypeFromShape(rec);
    if (!guess) return null;
    next._type = guess;
  }
  switch (next._type) {
    case "chart": {
      const ct = typeof next.chartType === "string" ? next.chartType : "";
      if (!CHART_FORM_SET.has(ct)) {
        const raw = ct.toLowerCase().replace(/[\s_]+/g, "-");
        next.chartType = CHART_FORM_SET.has(raw) ? raw : "bar";
      }
      if (typeof next.title !== "string") next.title = "Chart";
      if (next.data !== undefined) {
        next.data = asRecordList(next.data)
          .map((p) => ({ ...p, value: asNumber(p.value) }))
          .filter((p): p is { value: number } & Record<string, unknown> =>
            p.value !== null,
          );
      }
      if (next.series !== undefined) {
        next.series = asRecordList(next.series)
          .map((s) => ({
            ...s,
            name: asText(s.name) ?? "",
            data: (Array.isArray(s.data) ? s.data : []).map(asNumber),
          }))
          .filter((s) => s.name !== "" && s.data.every((d) => d !== null))
          .map((s) => ({
            ...s,
            data: s.data as number[],
          }));
      }
      if (next.groups !== undefined) {
        next.groups = asRecordList(next.groups)
          .map((g) => ({
            ...g,
            name: asText(g.name) ?? "",
            values: (Array.isArray(g.values) ? g.values : []).map(asNumber),
          }))
          .filter((g) => g.name !== "" && g.values.every((v) => v !== null))
          .map((g) => ({
            ...g,
            values: g.values as number[],
          }));
      }
      if (next.matrix !== undefined) {
        const m = asRecord(next.matrix);
        if (!m) {
          next.matrix = undefined;
        } else {
          const rows = (Array.isArray(m.rows) ? m.rows : []).map((r) =>
            String(r ?? ""),
          );
          const cols = (Array.isArray(m.cols) ? m.cols : []).map((c) =>
            String(c ?? ""),
          );
          const values = (Array.isArray(m.values) ? m.values : [])
            .map((row) => (Array.isArray(row) ? row.map(asNumber) : []))
            .map((row) => row.map((v) => v ?? 0));
          next.matrix = { rows, cols, values };
        }
      }
      if (next.scatter !== undefined) {
        next.scatter = asRecordList(next.scatter)
          .map((p) => ({ ...p, x: asNumber(p.x), y: asNumber(p.y) }))
          .filter(
            (p): p is { x: number; y: number } & Record<string, unknown> =>
              p.x !== null && p.y !== null,
          );
      }
      if (next.bins !== undefined) {
        next.bins = (Array.isArray(next.bins) ? next.bins : [])
          .map(asNumber)
          .filter((v): v is number => v !== null);
      }
      if (next.value !== undefined) {
        const v = asNumber(next.value);
        next.value = v ?? 0;
      }
      break;
    }
    case "table": {
      const columns = parseMaybeJson(next.columns);
      next.columns = Array.isArray(columns)
        ? columns.map((c) => (typeof c === "string" ? c : String(c ?? "")))
        : [];
      const rows = parseMaybeJson(next.rows);
      next.rows = Array.isArray(rows)
        ? rows.map((row) => normalizeTableRow(row))
        : [];
      break;
    }
    case "stat": {
      if (typeof next.label !== "string") next.label = "Metric";
      if (typeof next.value !== "string" && typeof next.value !== "number") {
        next.value = 0;
      }
      if (next.trend !== undefined && !STAT_TRENDS.has(String(next.trend))) {
        next.trend = undefined;
      }
      break;
    }
    case "progress": {
      if (typeof next.label !== "string") next.label = "Progress";
      const value = Number(next.value);
      next.value = Number.isFinite(value) ? Math.min(100, Math.max(0, value)) : 0;
      if (next.status !== undefined && !PROGRESS_STATUSES.has(String(next.status))) {
        next.status = undefined;
      }
      break;
    }
    case "form": {
      if (typeof next.title !== "string") next.title = "Form";
      next.fields = asRecordList(next.fields)
        .map((f) => {
          const name = asText(f.name) ?? asText(f.label) ?? "";
          const label = asText(f.label) ?? name;
          const type = FORM_FIELD_TYPES.has(String(f.type))
            ? String(f.type)
            : "text";
          return {
            ...f,
            name,
            label,
            type,
            ...(Array.isArray(f.options)
              ? { options: f.options.map((o) => String(o ?? "")) }
              : {}),
          };
        })
        .filter((f) => f.name !== "");
      break;
    }
    case "gallery": {
      next.images = asRecordList(next.images).flatMap((img) => {
        const src = asUrl(img.src);
        if (!src) return [];
        const alt = asText(img.alt) ?? src;
        return [{ ...img, src, alt }];
      });
      break;
    }
    case "code": {
      if (typeof next.language !== "string") next.language = "text";
      if (typeof next.code !== "string") next.code = "";
      break;
    }
    case "diagram": {
      if (typeof next.code !== "string") next.code = "";
      break;
    }
    case "map": {
      next.places = asRecordList(next.places).flatMap((p) => {
        const label = asText(p.label);
        const lat = asNumber(p.lat);
        const lng = asNumber(p.lng);
        return label && lat !== null && lng !== null
          ? [{ ...p, label, lat, lng }]
          : [];
      });
      break;
    }
    default:
      break;
  }
  if (!differs(rec, next)) return null;
  // The SDK RE-VALIDATES a repaired call, so anything that still fails the
  // tool's own schema must not be returned — it would fail again with the
  // same error and the model would loop on it.
  return widgetSchema.safeParse(next).success ? next : null;
};
