// Φ-docs · daily scheduled jobs.
//
// `retention.sweep` is FAIL-CLOSED: it is a dry run (deletes nothing) until an
// operator sets the numeric `LEOPARD_RETENTION_DAYS` dashboard env var. So this
// daily cron is harmless by default and becomes an active retention sweep only
// when explicitly armed.

import { cronJobs } from "convex/server";
import { api } from "./_generated/api";

const crons = cronJobs();
crons.daily(
  "Retention sweep",
  { hourUTC: 4, minuteUTC: 21 }, // off-peak UTC predawn, off the top of the hour
  api.retention.sweep,
);
export default crons;