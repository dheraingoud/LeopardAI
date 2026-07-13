// Replace the assistant Copy button with Copy+Regen+Like+Dislike via a regex.
const fs = require('fs');
const p = 'components/chat/message.tsx';
let s = fs.readFileSync(p, 'utf-8');

// Identify the existing copy button block by its unique anchor text + capture
// the closing tags following it. We rebuild the whole <div className="flex items-center gap-0.5 ..."> block.

const anchor = 'onClick={handleCopy}';
// Find the assistant copy button (the LAST handleCopy call site — the one inside
// {!isStreaming && renderText} is the assistant one; the first onClick={handleCopy}
// is the assistant copy). Walk from "handleCopy}" end-line forward to find the
// assistant block — distinguishable by being AFTER docParts rendering.
const idxs = [];
let si = -1;
while (true) {
  si = s.indexOf(anchor, si + 1);
  if (si < 0) break;
  idxs.push(si);
}
console.log('handleCopy occurrences:', idxs.length, 'at', idxs);
if (idxs.length < 1) process.exit(1);

// Pick the LAST (assistant) one.
const target = idxs[idxs.length - 1];

// Walk backward to find the opening {!isStreaming && renderText && (
const openStart = s.lastIndexOf('          {!isStreaming && renderText && (', target);
const openEnd = s.indexOf('>', openStart) + 1; // after the <div>...> tag
if (openStart < 0 || openEnd < 0) { console.log('open not found'); process.exit(1); }

// Walk forward to find the matching two</div</motion.div>) closures for the
// assistant bubble. Easier: walk to the LAST</div> for this '{!isStreaming...' block.
// The and-tag closes at `          )}`, find that.
const closeTagIdx = s.indexOf('          )}', openStart);
if (closeTagIdx < 0) { console.log('!isStreaming close not found'); process.exit(1); }
const closeEnd = closeTagIdx + '          )}'.length;

const old = s.slice(openStart, closeEnd);
console.log('OLD start idx:', openStart, 'length:', old.length);

// Build replacement. We keep the wrapper div className but expand its
// contents from just <button copy> to <button copy><button regen><button like><button dislike>.
const replacement = [
  '          {!isStreaming && renderText && (',
  '            <div className="flex items-center gap-0.5 mt-3 opacity-0 group-hover:opacity-100 transition-opacity duration-200">',
  '              <button',
  '                type="button"',
  '                onClick={handleCopy}',
  '                aria-label="Copy"',
  '                className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-mono dark:text-[#353535] light:text-[#262626] hover:dark:text-[#e5e5e5] hover:light:text-[#1f1607] hover:dark:bg-white/[0.04] hover:light:bg-black/[0.03] transition-colors"',
  '              >',
  '                {copied ? (',
  '                  <>',
  '                    <Check className="h-3 w-3 text-green-400" /> Copied',
  '                </>',
  '                ) : (',
  '                  <>',
  '                    <Copy className="h-3 w-3" /> Copy',
  '                </>',
  '                )}',
  '            </button>',
  '              <button',
  '                type="button"',
  '                onClick={handleRegenerate}',
  '                aria-label="Regenerate"',
  '                disabled={chat.status === "submitted" || chat.status === "streaming"}',
  '                className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-mono dark:text-[#353535] light:text-[#262626] hover:dark:text-[#ffb400] hover:light:text-[#d49600] disabled:opacity-40 hover:dark:bg-[#ffb400]/[0.06] hover:light:bg-[#ffb400]/[0.08] transition-colors"',
  '              >',
  '                <RotateCcw className="h-3 w-3" /> Regen',
  '            </button>',
  '              <button',
  '                type="button"',
  '                onClick={handleLike}',
  '                aria-label="Like"',
  '                title="Mark as helpful"',
  '                className={[' +
    '"flex items-center justify-center h-7 w-7 rounded-md transition-colors",' +
    'feedbackVote === "up" ? "dark:bg-[#ffb400]/[0.12] light:bg-[#ffb400]/[0.16] dark:text-[#ffb400] light:text-[#d49600]" : "dark:text-[#505050] light:text-[#b8b8b8] hover:dark:text-[#ffb400] hover:light:text-[#d49600] hover:dark:bg-[#ffb400]/[0.06] hover:light:bg-[#ffb400]/[0.08]"].join(" ")' +
  '}',
  '              >',
  '                <ThumbsUp className="h-3 w-3" />',
  '            </button>',
  '              <button',
  '                type="button"',
  '                onClick={handleDislike}',
  '                aria-label="Dislike"',
  '                title="Mark as unhelpful"',
  '                className={[' +
    '"flex items-center justify-center h-7 w-7 rounded-md transition-colors",' +
    'feedbackVote === "down" ? "dark:bg-amber-400/[0.12] light:bg-amber-500/[0.16] dark:text-amber-300 light:text-amber-700" : "dark:text-[#505050] light:text-[#b8b8b8] hover:dark:text-amber-300 hover:light:text-amber-700 hover:dark:bg-amber-300/[0.06] hover:light:bg-amber-500/[0.08]"].join(" ")' +
  '}',
  '              >',
  '                <ThumbsDown className="h-3 w-3" />',
  '            </button>',
  '          </div>',
  '          )}',
].join('\n');

s = s.slice(0, openStart) + replacement + s.slice(closeEnd);
fs.writeFileSync(p, s);
console.log('done — wrote replacement; closed block from idx', openStart, 'to', closeEnd);
