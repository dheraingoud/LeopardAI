// Chat-title derivation helpers.
//
// The title model is a reasoning model (nemotron-3.5-lightning): with
// thinking on it burns its token budget on reasoning_content and returns
// content:null, so generateText().text is "". The sidebar then shows a blank
// name forever. These helpers make the title deterministic and never empty.

export const UNTITLED_CHAT_TITLE = "New Chat";

const MAX_TITLE_WORDS = 6;
const MAX_TITLE_CHARS = 48;

/** True when a persisted chat title still needs generating. */
export const needsTitle = (title: string | undefined | null): boolean => {
  const t = (title ?? "").trim();
  return t.length === 0 || t === UNTITLED_CHAT_TITLE;
};

/**
 * Deterministic fallback title from the user's own words. Used when the
 * title model fails or returns nothing — the chat must never be left blank.
 */
export const fallbackTitleFrom = (text: string): string => {
  const flat = (text ?? "")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/[#*_`>]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!flat) return UNTITLED_CHAT_TITLE;
  const firstSentence = flat.split(/[.!?\n]/)[0] ?? flat;
  const words = firstSentence.split(" ").filter(Boolean);
  const picked = words.slice(0, MAX_TITLE_WORDS).join(" ").slice(0, MAX_TITLE_CHARS).trim();
  return picked || UNTITLED_CHAT_TITLE;
};

/**
 * Clean a model-generated title. Strips fences/quotes/labels and rejects
 * anything empty or prompt-echoing — an empty result means "use the
 * fallback", never "persist a blank title".
 */
export const cleanGeneratedTitle = (
  raw: string | undefined | null,
  source: string,
): string => {
  const text = (raw ?? "").trim();
  if (!text) return fallbackTitleFrom(source);
  const unfenced = text.replace(/```[a-zA-Z0-9]*\s*/g, " ").trim();
  if (!unfenced) return fallbackTitleFrom(source);
  const firstLine = unfenced.split("\n").find((l) => l.trim().length > 0) ?? "";
  const cleaned = firstLine
    .replace(/^["'`\s]+/, "")
    .replace(/["'`]+$/, "")
    .replace(/^(?:title|chat)\s*[:\-–]\s*/i, "")
    .trim();
  if (!cleaned) return fallbackTitleFrom(source);
  if (cleaned.length > 80) return fallbackTitleFrom(source);
  if (cleaned.toLowerCase() === UNTITLED_CHAT_TITLE.toLowerCase()) {
    return fallbackTitleFrom(source);
  }
  return cleaned;
};
