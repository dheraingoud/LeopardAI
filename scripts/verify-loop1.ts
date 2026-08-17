import { resolveFetchHostPolicy } from "../lib/ai/fetch-policy";
import { redact, redactUrlForDisplay } from "../lib/redact";

const CASES: Array<[string, boolean]> = [
  ["localhost", false],
  ["127.0.0.1", false],
  ["10.1.2.3", false],
  ["192.168.1.5", false],
  ["169.254.9.9", false],
  ["100.64.0.1", false],
  ["::1", false],
  ["fe80::1", false],
  ["internal.corp.local", false],
  ["example.com", true],
  ["docs.example.com", true],
];
let pass = 0;
const fail: string[] = [];
for (const [host, allowed] of CASES) {
  const v = resolveFetchHostPolicy(host, {});
  if (v.allowed === allowed) pass++;
  else fail.push(`host ${host} got ${JSON.stringify(v)}, want allowed=${allowed}`);
}
if (resolveFetchHostPolicy("evil.example", { denylist: "evil.example" }).allowed) fail.push("denylist miss");
else pass++;
if (resolveFetchHostPolicy("random.org", { allowlist: "example.com" }).allowed) fail.push("allowlist gate miss");
else pass++;
if (!resolveFetchHostPolicy("sub.example.com", { allowlist: "example.com" }).allowed) fail.push("allowlist subdomain miss");
else pass++;

const secret = "Bearer abc123def456ghi"
  + " | nvapi-abcdef0123456789"
  + " | sk-ant-xxxxyyyy"
  + " | password=SuperSecret1"
  + " | C:\Users\HP\app\next.config.js"
  + " | /etc/nginx/nginx.conf"
  + " | admin@leopard.chat"
  + " | https://user:hunter2@example.com/path?token=t5789";
const r = redact(secret);
for (const needle of ["SuperSecret1", "abc123def456", "hunter2", "admin@leopard"]) {
  if (r.includes(needle)) fail.push(`not redacted: ${needle}`);
  else pass++;
}
const u = redactUrlForDisplay("https://user:hunter2@example.com/x?token=t5789&sig=aa");
if (u.includes("hunter2") || u.includes("t5789")) fail.push("url display leak: " + u);
else pass++;

console.log(`PASSED ${pass}` + (fail.length ? ` | FAILED ${fail.length}\n` + fail.join("\n") : " | ALL"));
process.exit(fail.length ? 1 : 0);
