import { isIPv4 } from "node:net";

// ═══════════════════════════════════════════════════════════════════════════
// SSRF gate for the webFetch tool (claude-code-docs/docs/permissions.md
// "WebFetch(domain:…)" + docs/mcp.md domain-safety preflight).
//
// A public webFetch must never be able to reach the operator's internal
// surface. We reject, in order:
//   1. Private / loopback / link-local / CGNAT / ULA hosts (RFC1918, ::1,
//      fe80::/10, 169.254/16, 100.64/10, 10/8, 172.16/12, 192.168/16, fc00::/7).
//   2. Any host in the enforced LEOPARD_FETCH_DENYLIST (always blocks, wins over
//      everything).
//   3. If LEOPARD_FETCH_ALLOWLIST is set, any host not in it.
//
// Allowlist/denylist entries are comma-separated domains, where an entry may be
// an exact host ("docs.example.com") or a bare domain that also matches its
// subdomains ("example.com" → *.example.com). Matching is case-insensitive.
//
// Policy resolution is read per-call (process.env is mutable in tests) and is a
// pure function — unit-testable without touching the network.
// ═══════════════════════════════════════════════════════════════════════════

export type HostVerdict = { allowed: boolean; reason?: string };

function isPrivateIp(hostname: string): boolean {
  if (hostname === "localhost") return true;
  if (hostname.endsWith(".local") || hostname.endsWith(".localhost")) return true;
  if (hostname === "::1") return true;
  if (hostname.toLowerCase().startsWith("fe80:")) return true;
  const l = hostname.toLowerCase();
  if (l.startsWith("fc") || l.startsWith("fd")) {
    // IPv6 ULA = fc00::/7 → first hex digit 8-f in the fc/fd range.
    if (/^f[cd][0-9a-f]:/i.test(hostname)) return true;
  }
  if (isIPv4(hostname)) {
    const parts = hostname.split(".").map(Number);
    const [a, b] = parts;
    if (a === 10) return true; // 10/8
    if (a === 127) return true; // loopback
    if (a === 169 && b === 254) return true; // link-local
    if (a === 172 && b >= 16 && b <= 31) return true; // 172.16/12
    if (a === 192 && b === 168) return true; // 192.168/16
    if (a === 100 && b >= 64 && b <= 127) return true; // 100.64/10 CGNAT
    if (a === 0) return true; // 0.0.0.0/8
  }
  return false;
}

function match(hostname: string, entries: string[]): boolean {
  const h = hostname.toLowerCase();
  for (const raw of entries) {
    const e = raw.trim().replace(/^\./, "").toLowerCase();
    if (!e) continue;
    if (h === e) return true;
    if (h.endsWith("." + e)) return true; // bare domain → *.example.com
  }
  return false;
}

function splitEnv(value: string | undefined): string[] {
  return (value ?? "").split(",").map((s) => s.trim()).filter(Boolean);
}

/** Resolve the operator allow/deny policy for a fetched host. Pure + env-aware. */
export function resolveFetchHostPolicy(
  hostname: string,
  opts?: {
    allowlist?: string;
    denylist?: string;
  },
): HostVerdict {
  const denylist = splitEnv(opts?.denylist ?? process.env.LEOPARD_FETCH_DENYLIST);
  const allowlist = splitEnv(opts?.allowlist ?? process.env.LEOPARD_FETCH_ALLOWLIST);

  // Always block internal/private — SSRF remote-host surface is the top threat.
  if (isPrivateIp(hostname)) {
    return { allowed: false, reason: "private_or_reserved_host" };
  }

  if (denylist.length && match(hostname, denylist)) {
    return { allowed: false, reason: "domain_blocked" };
  }

  // No allowlist → the public internet is the default surface.
  if (allowlist.length && !match(hostname, allowlist)) {
    return { allowed: false, reason: "domain_not_allowlisted" };
  }

  return { allowed: true };
}

/** Simple hostname extraction from a URL string; null on unparseable. */
export function hostFromUrl(url: string): string | null {
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}