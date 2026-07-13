// TEMP debug: log streamText chain errors to disk so I can see what's failing.
const fs = require('fs');
const p = 'app/api/chat/route.ts';
let s = fs.readFileSync(p, 'utf-8');

// Capture the error that the AI SDK throws. Log to a file path.
if (!s.includes('[CHAT-DBG]')) {
  const before = '      const result = streamText({';
  const after = "      const result = streamText({\n        onError: ({ error }) => { try { require('node:fs').appendFileSync('C:/Users/HP/OneDrive/Desktop/leopard/.playwright-mcp/chat-debug.log', new Date().toISOString() + ' STREAM_TEXT_ERROR ' + String(error?.message || error) + '\\n'); } catch {} },";
  // just edited.
}

// Just append debug logging to file. Reuse if already patched.
s = s.replace(
  /onError: \(error\) => \{[\s\S]*?return "Oops[\s\S]*?\};/,
  `onError: (error) => {
      try {
        require('node:fs').appendFileSync(
          'C:/Users/HP/OneDrive/Desktop/leopard/.playwright-mcp/chat-debug.log',
          new Date().toISOString() + ' OUTER_onError ' + String(error?.message || error) + '\\n',
        );
      } catch {}
      if (error instanceof Error) {
        if (error.message.includes("AI Gateway requires a valid credit card")) return "AI Gateway requires...";
        if (/401|unauthorized|api key/i.test(error.message)) return "auth missing";
      }
      return "Oops, an error occurred while generating the response.";
    },`,
);

fs.writeFileSync(p, s);
console.log('done');
