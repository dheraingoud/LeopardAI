import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api";
import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

async function main() {
  const c = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);
  (c as any).setAdminAuth(process.env.CONVEX_DEPLOY_KEY!);
  const chats = (await c.query(api.chats.list as never, { userId: "leopard-dev-test-user-0001" } as never)) as any[];
  const chat = [...chats].sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))[0];
  const rows = (await c.query(api.messages.list as never, { chatId: chat._id } as never)) as any[];
  const last = rows[rows.length - 1];
  for (const p of last.parts ?? []) {
    console.log(p.type, "len:", (p.text ?? "").length, JSON.stringify((p.text ?? "").slice(0, 80)));
  }
}
void main();
