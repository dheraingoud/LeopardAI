import "dotenv/config";
import { searchWeb } from "@/lib/ai/tools/web-search";
async function main() {
  for (const q of ["spiking neural network ECG", "next.js caching 2025"]) {
    const r = await searchWeb({ query: q });
    console.log(q, "→", "error" in r ? `${r.error} ${r.status ?? ""} ${r.detail ?? ""}` : `${r.results.length} results`);
  }
}
main();
