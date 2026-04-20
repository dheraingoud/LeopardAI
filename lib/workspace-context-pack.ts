interface ContextPackSection {
  key: string;
  title: string;
  content: string;
  priority?: number;
  required?: boolean;
  maxChars?: number;
}

interface BuildContextPackInput {
  workspace: string;
  mode: string;
  objective: string;
  sections: ContextPackSection[];
  sourceCount?: number;
  maxChars?: number;
}

interface ContextPackResult {
  text: string;
  rawChars: number;
  packedChars: number;
  droppedKeys: string[];
  keptKeys: string[];
  compressionRatio: number;
}

const DEFAULT_MAX_CHARS = 32_000;
const DEFAULT_SECTION_CAP = 8_500;

function cleanText(value: string): string {
  return value
    .replace(/\r/g, "")
    .replace(/\t/g, "  ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function shrinkSegment(content: string, maxChars: number): string {
  const normalized = cleanText(content);
  if (normalized.length <= maxChars) return normalized;

  const lines = normalized.split("\n");
  if (lines.length <= 6) {
    const head = normalized.slice(0, Math.floor(maxChars * 0.72)).trimEnd();
    const tail = normalized.slice(-Math.floor(maxChars * 0.22)).trimStart();
    const omitted = Math.max(0, normalized.length - head.length - tail.length);
    return `${head}\n\n...[${omitted} chars omitted for context budget]...\n\n${tail}`;
  }

  const headLines = Math.max(4, Math.floor(lines.length * 0.58));
  const tailLines = Math.max(2, Math.floor(lines.length * 0.18));
  const head = lines.slice(0, headLines).join("\n");
  const tail = lines.slice(-tailLines).join("\n");
  const combined = `${head}\n\n...[${Math.max(0, lines.length - headLines - tailLines)} lines omitted for context budget]...\n\n${tail}`;

  if (combined.length <= maxChars) {
    return combined;
  }

  const trimmedHead = combined.slice(0, Math.floor(maxChars * 0.8)).trimEnd();
  const trimmedTail = combined.slice(-Math.floor(maxChars * 0.15)).trimStart();
  const omitted = Math.max(0, combined.length - trimmedHead.length - trimmedTail.length);
  return `${trimmedHead}\n\n...[${omitted} chars omitted for context budget]...\n\n${trimmedTail}`;
}

function buildSectionBlock(section: ContextPackSection, content: string): string {
  return [`[${section.title}]`, content].join("\n");
}

export function buildWorkspaceContextPack(input: BuildContextPackInput): ContextPackResult {
  const maxChars = Math.max(8_000, input.maxChars || DEFAULT_MAX_CHARS);

  const sorted = [...input.sections].sort((a, b) => {
    const reqDelta = Number(Boolean(b.required)) - Number(Boolean(a.required));
    if (reqDelta !== 0) return reqDelta;
    return (b.priority || 0) - (a.priority || 0);
  });

  const normalizedSections = sorted
    .map((section) => {
      const raw = cleanText(section.content);
      const perSectionCap = Math.min(section.maxChars || DEFAULT_SECTION_CAP, Math.floor(maxChars * 0.62));
      const packed = raw ? shrinkSegment(raw, perSectionCap) : "";
      return {
        ...section,
        raw,
        packed,
      };
    })
    .filter((section) => section.packed.length > 0);

  const header = [
    `Workspace: ${input.workspace}`,
    `Mode: ${input.mode}`,
    `Objective: ${cleanText(input.objective) || "N/A"}`,
    `Sources: ${input.sourceCount || 0}`,
    "",
    "Use this context pack as the authoritative workspace state.",
  ].join("\n");

  const blocks: string[] = [header];
  const keptKeys: string[] = [];
  const droppedKeys: string[] = [];

  for (const section of normalizedSections) {
    const block = buildSectionBlock(section, section.packed);
    const candidate = `${blocks.join("\n\n")}\n\n${block}`;

    if (candidate.length <= maxChars) {
      blocks.push(block);
      keptKeys.push(section.key);
      continue;
    }

    if (section.required) {
      const reserve = Math.max(1_500, maxChars - blocks.join("\n\n").length - 120);
      const forced = buildSectionBlock(section, shrinkSegment(section.packed, reserve));
      blocks.push(forced);
      keptKeys.push(section.key);
      continue;
    }

    droppedKeys.push(section.key);
  }

  let text = blocks.join("\n\n");
  if (text.length > maxChars) {
    text = shrinkSegment(text, maxChars);
  }

  const rawChars = normalizedSections.reduce((sum, section) => sum + section.raw.length, header.length);
  const packedChars = text.length;

  return {
    text,
    rawChars,
    packedChars,
    droppedKeys,
    keptKeys,
    compressionRatio: rawChars > 0 ? packedChars / rawChars : 1,
  };
}
