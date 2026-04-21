export interface SearchResult {
  chatId: string;
  chatTitle: string;
  messageId: string;
  excerpt: string;
}

interface ChatMessage {
  id: string;
  role: string;
  content: string;
}

interface Chat {
  id: string;
  title: string;
  messages: ChatMessage[];
}

export function searchChats(
  chats: Record<string, Chat>,
  query: string
): SearchResult[] {
  if (!query.trim()) return [];

  const lowerQuery = query.toLowerCase();
  const results: SearchResult[] = [];

  for (const chat of Object.values(chats)) {
    for (const msg of chat.messages) {
      // Skip system messages
      if (msg.role === 'system') continue;

      const content = msg.content ?? '';
      const lowerContent = content.toLowerCase();
      const matchIdx = lowerContent.indexOf(lowerQuery);

      if (matchIdx === -1) continue;

      const excerptStart = Math.max(0, matchIdx - 50);
      const excerptEnd = Math.min(content.length, matchIdx + query.length + 100);

      const excerpt = (
        (excerptStart > 0 ? '...' : '') +
        content.slice(excerptStart, excerptEnd) +
        (excerptEnd < content.length ? '...' : '')
      );

      results.push({
        chatId: chat.id,
        chatTitle: chat.title,
        messageId: msg.id,
        excerpt,
      });
    }
  }

  return results;
}