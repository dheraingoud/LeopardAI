// Φ-docs addon A · output styles — pure, no network. Proves env-gating
// (fail-closed default-off), per-turn override, sanitization, and prompt append.
// Run: cd next-frontend && npx tsx scripts/verify-output-styles.ts
import {
  OUTPUT_STYLE_KEYS,
  applyStyleToPrompt,
  defaultOutputStyle,
  resolveOutputStyleDirective,
  sanitizeOutputStyle,
} from "../lib/ai/output-styles";

let pass = 0;
let fail = 0;
const check = (name: string, ok: boolean, extra = "") => {
  if (ok) pass++;
  else {
    fail++;
    console.error(`FAIL ${name}${extra ? " — " + extra : ""}`);
  }
};

function main() {
  // Keys bounded to the known set.
  check("five built-in keys", OUTPUT_STYLE_KEYS.length === 5, String(OUTPUT_STYLE_KEYS.length));
  check("default key present", OUTPUT_STYLE_KEYS.includes("default"));

  // Environment default (fail-closed).
  const prev = process.env.LEOPARD_OUTPUT_STYLE;
  const setEnv = (v: string | undefined) => {
    if (v === undefined) delete process.env.LEOPARD_OUTPUT_STYLE;
    else process.env.LEOPARD_OUTPUT_STYLE = v;
  };
  setEnv(undefined);
  check("env unset → no default", defaultOutputStyle() === undefined);
  setEnv("concise");
  check("env 'concise' → concise", defaultOutputStyle() === "concise");
  setEnv("Concise");
  check("env case-insensitive", defaultOutputStyle() === "concise");
  setEnv("bogus");
  check("env unknown → no default (fail-closed)", defaultOutputStyle() === undefined);
  setEnv("default");
  check("env 'default' → no style (explicit baseline)", defaultOutputStyle() === undefined);
  setEnv(prev);

  // Resolution: per-turn style beats env; env used when no style; unknown → "".
  const getEnv = (v: string | undefined) => ({ env: { ...(v ? { LEOPARD_OUTPUT_STYLE: v } : {}) } });
  check("no style, no env → ''", resolveOutputStyleDirective({}) === "");
  check("style 'proactive' → directive", resolveOutputStyleDirective({ style: "proactive" }).includes("OUTPUT-STYLE (proactive)"));
  check("style unknown → '' (fail-closed)", resolveOutputStyleDirective({ style: "quantum" }) === "");
  check("env default used when no style", resolveOutputStyleDirective(getEnv("learning")).includes("OUTPUT-STYLE (learning)"));
  check("per-turn override beats env default", resolveOutputStyleDirective({ style: "explanatory", ...getEnv("concise") }).includes("OUTPUT-STYLE (explanatory)"));
  check("'default' style arg → env fallback not baseline", resolveOutputStyleDirective({ style: "default", ...getEnv("concise") }).includes("OUTPUT-STYLE (concise)"));

  // Custom directives map (deploy-layer extension).
  const custom = { custom: "CUSTOM-MODE rx" };
  check("custom map honored", resolveOutputStyleDirective({ style: "custom", directives: custom }) === "CUSTOM-MODE rx");
  check("custom map: unknown → ''", resolveOutputStyleDirective({ style: "nope", directives: custom }) === "");

  // Sanitization.
  check("sanitize known (case-insensitive)", sanitizeOutputStyle("Concise") === "concise");
  check("sanitize unknown → undefined", sanitizeOutputStyle("crazy") === undefined);
  check("sanitize non-string → undefined", sanitizeOutputStyle(42) === undefined);
  check("sanitize 'default' → undefined (already baseline)", sanitizeOutputStyle("default") === undefined);

  // Prompt append.
  const base = "You are Leopard. Follow these rules.";
  check("empty directive → prompt unchanged", applyStyleToPrompt(base, "") === base);
  const styled = applyStyleToPrompt(base, "OUTPUT-STYLE (concise):\n- Be terse.");
  check("directive appended, whitespace-collapsed", styled === "You are Leopard. Follow these rules.\n\nOUTPUT-STYLE (concise):\n- Be terse.");

  console.log(`\noutput-styles: ${pass} pass, ${fail} fail`);
  process.exit(fail > 0 ? 1 : 0);
}

try {
  main();
} catch (e) {
  console.error("OUTPUT-STYLES VERIFY FAIL:", e instanceof Error ? e.message : e);
  process.exit(1);
}