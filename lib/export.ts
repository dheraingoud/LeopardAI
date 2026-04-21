export interface ExportChat {
  title: string;
  createdAt: number;
  model: string;
  messages: Array<{ role: string; content: string }>;
}

function formatDate(ts: number): string {
  return new Date(ts).toLocaleString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function exportChatAsMarkdown(chat: ExportChat): string {
  const lines: string[] = [];

  lines.push(`# ${chat.title}`);
  lines.push('');
  lines.push(`> **Date:** ${formatDate(chat.createdAt)}  `);
  lines.push(`> **Model:** ${chat.model}`);
  lines.push('');

  for (const msg of chat.messages) {
    if (msg.role === 'system') continue;

    const label = msg.role === 'user' ? '**You:**' : '**Leopard:**';
    lines.push('---');
    lines.push('');
    lines.push(`${label}`);
    lines.push('');
    lines.push(msg.content ?? '');
    lines.push('');
  }

  return lines.join('\n');
}

export function exportChatAsJSON(chat: unknown): string {
  return JSON.stringify(chat, null, 2);
}

export function triggerDownload(
  content: string,
  filename: string,
  mimeType: string
): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.style.display = 'none';

  document.body.appendChild(link);
  link.click();

  // Clean up synchronously — the click is synchronous in browsers
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}