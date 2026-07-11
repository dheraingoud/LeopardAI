// Patch PlusMenu signature to accept modelImageEdit + add capability logic
const fs = require('fs');
const p = 'components/chat/plus-menu.tsx';
let s = fs.readFileSync(p, 'utf-8');

const oldSig = 'export function PlusMenu({ modelVision, onPickMedia, onPickFile, onPickSkill }: Props) {';
const idx = s.indexOf(oldSig);
console.log('sig idx:', idx);
if (idx < 0) { console.log('NOT FOUND'); process.exit(1); }
const restIdx = s.indexOf('return (', idx);
console.log('return idx:', restIdx);

const newSig = [
  'export function PlusMenu({',
  '  modelVision,',
  '  modelImageEdit,',
  '  onPickMedia,',
  '  onPickFile,',
  '  onPickSkill,',
  '}: Props) {',
  '  const [open, setOpen] = useState(false);',
  '  const mediaRef = useRef<HTMLInputElement>(null);',
  '  const fileRef = useRef<HTMLInputElement>(null);',
  '  const skillRef = useRef<HTMLTextAreaElement>(null);',
  '',
  '  // Φ9: effective media attach capability + the right <input accept>.',
  '  const canAttachMedia = modelVision || !!modelImageEdit;',
  '  const mediaAccept = modelImageEdit && !modelVision ? "image/*" : "image/*,video/*";',
  '  const mediaHint = modelVision',
  '    ? undefined',
  '    : modelImageEdit',
  '      ? "image only"',
  '      : "needs VLM";',
  '',
].join('\n');

const before = s.slice(0, idx);
const after = s.slice(restIdx);
s = before + newSig + after;
fs.writeFileSync(p, s);
console.log('PATCHED');
