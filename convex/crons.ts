// Φ-docs · daily scheduled jobs.
//
// `retention.sweep` is FAIL-CLOSED: it is a dry run (deletes nothing) until an
// operator sets the numeric `LEOPARD_RETENTION_DAYS` dashboard env var. So this
// daily cron is harmless by default and becomes an active retention sweep only
// when explicitly armed.

import { cronJobs } from "convex/server";
import { api, internal } from "./_generated/api";

const crons = cronJobs();
crons.daily(
  "Retention sweep",
  { hourUTC: 4, minuteUTC: 21 }, // off-peak UTC predawn, off the top of the hour
  api.retention.sweep,
);
// Stale-generating sweep (audit 2026-10-06): clear orphaned sidebar "generating"
// blinks server-side every minute, regardless of any open tab. Cheap — indexed.
crons.interval(
  "Stale generating sweep",
  { minutes: 1 },
  internal.retention.sweepStaleGenerating,
);
// Model health sweep (2026-10-09): probe the fleet server-side every 30 min and
// cache to modelHealth — replaces the per-login 9-model burst (real upstream
// cost + a multi-minute picker stall). The action calls the app's own
// /api/models/health (which owns the NIM key) and records results.
crons.interval(
  "Model health sweep",
  { minutes: 30 },
  internal.health.sweep,
);
export default crons;