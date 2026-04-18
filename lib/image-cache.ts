import localforage from "localforage";

const IMAGE_CACHE_PREFIX = "leopard-image";

export interface ImageCacheEntry {
  id: string;
  url: string;
  mimeType?: string;
  createdAt: number;
}

const imageStore = localforage.createInstance({
  name: "leopard",
  storeName: "images",
});

function buildStorageKey(messageId: string) {
  return `${IMAGE_CACHE_PREFIX}:${messageId}`;
}

function normalizeImageId(value: string) {
  return value.trim().toUpperCase();
}

export function sanitizeMessageForStorage(content: string): {
  content: string;
  images: ImageCacheEntry[];
} {
  const seen = new Set<string>();
  const images: ImageCacheEntry[] = [];

  const imageRegex = /!\[[^\]]*\]\((https?:\/\/[^\s)]+|data:image\/[^)\s]+|blob:[^)\s]+)\)/gi;

  const sanitizedContent = content.replace(imageRegex, (_match, url: string) => {
    const id = normalizeImageId(crypto.randomUUID());
    if (!seen.has(id)) {
      seen.add(id);
      images.push({
        id,
        url,
        createdAt: Date.now(),
      });
    }

    return `![Generated image](#img-${id}) <!-- img:${id} -->`;
  });

  return {
    content: sanitizedContent,
    images,
  };
}

export async function persistImagesForMessage(
  messageId: string,
  images: ImageCacheEntry[],
): Promise<void> {
  if (images.length === 0) return;

  const key = buildStorageKey(messageId);
  const existing = (await imageStore.getItem<ImageCacheEntry[]>(key)) || [];

  const map = new Map<string, ImageCacheEntry>();
  for (const entry of existing) {
    map.set(normalizeImageId(entry.id), {
      ...entry,
      id: normalizeImageId(entry.id),
    });
  }

  for (const entry of images) {
    map.set(normalizeImageId(entry.id), {
      ...entry,
      id: normalizeImageId(entry.id),
      createdAt: entry.createdAt || Date.now(),
    });
  }

  await imageStore.setItem(key, Array.from(map.values()));
}

function extractImagePlaceholders(content: string): Array<{ id: string }> {
  const regex = /!\[[^\]]*\]\(#img-([A-Z0-9-]+)\)\s*<!--\s*img:([A-Z0-9-]+)\s*-->/gi;
  const placeholders: Array<{ id: string }> = [];

  let match: RegExpExecArray | null;
  while ((match = regex.exec(content)) !== null) {
    const a = normalizeImageId(match[1]);
    const b = normalizeImageId(match[2]);
    placeholders.push({ id: a === b ? a : b });
  }

  return placeholders;
}

export async function hydrateMessageImages(
  messageId: string,
  content: string,
): Promise<string> {
  const placeholders = extractImagePlaceholders(content);
  if (placeholders.length === 0) return content;

  const key = buildStorageKey(messageId);
  const cached = (await imageStore.getItem<ImageCacheEntry[]>(key)) || [];
  if (cached.length === 0) return content;

  const map = new Map<string, ImageCacheEntry>();
  for (const item of cached) {
    map.set(normalizeImageId(item.id), item);
  }

  let hydrated = content;
  for (const placeholder of placeholders) {
    const entry = map.get(placeholder.id);
    if (!entry) continue;

    const safeId = placeholder.id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pattern = new RegExp(
      `!\\[[^\\]]*\\]\\(#img-${safeId}\\)\\s*<!--\\s*img:${safeId}\\s*-->`,
      "gi",
    );
    hydrated = hydrated.replace(pattern, `![Generated image](${entry.url})`);
  }

  return hydrated;
}

export async function clearMessageImageCache(messageId: string): Promise<void> {
  await imageStore.removeItem(buildStorageKey(messageId));
}
