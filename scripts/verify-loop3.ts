import { parseApprovalRules, resolveApproval } from "../lib/ai/tool-policy";

let pass = 0; const fail: string[] = [];
const chk = (name: string, ok: boolean, extra = "") => ok ? pass++ : fail.push(name + (extra ? " — " + extra : ""));

const rules = parseApprovalRules("webSearch=allow,webFetch=ask,^mcp__=deny,my*[x]=(: not a rule");
chk("parsed 3 valid rules", rules.length === 3, `got ${rules.length}`);
chk("deny pattern kept", rules.some(r => r.mode === "deny"));

// deny veto beats allow
const d1 = resolveApproval("mcp__github__read", rules, "allow");
chk("deny vetoes allow-all", d1.mode === "deny", d1.reason);
// allow rule wins over default ask
const d2 = resolveApproval("webSearch", rules, "ask");
chk("webSearch=allow", d2.mode === "allow");
// ask
const d3 = resolveApproval("webFetch", rules, "ask");
chk("webFetch=ask", d3.mode === "ask", d3.reason);
// unmatched rule set → global policy
const d4 = resolveApproval("createDocument", rules, "deny");
chk("unmatched→global deny", d4.mode === "deny");
const d5 = resolveApproval("foo", [], "ask");
chk("no rules+ask → legacy webSearch-auto, else ask", d5.mode === "ask");
const d6 = resolveApproval("webSearch", [], "ask");
chk("legacy webSearch auto-allow", d6.mode === "allow");
console.log(`PASSED ${pass}` + (fail.length ? ` | FAILED ${fail.length}\n` + fail.join("\n") : " | ALL"));
process.exit(fail.length ? 1 : 0);
