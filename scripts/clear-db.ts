import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api";
import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
dotenv.config({ path: ".env" });

async function main() {
  const c = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);
  (c as any).setAdminAuth(process.env.CONVEX_DEPLOY_KEY!);
  const r = await c.mutation(api.migrations.clearAll as never, {} as never);
  console.log("clearAll:", r);
  // confirm empty
  const chats = (await c.query(api.chats.list as never, {
    userId: "leopard-dev-test-user-0001",
  } as never)) as any[];
  console.log("chats after:", chats.length);
}
main().catch((e) => { console.error(e); process.exit(1); });
