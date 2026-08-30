import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api";
import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

async function main() {
  const c = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);
  (c as any).setAdminAuth(process.env.CONVEX_DEPLOY_KEY!);
  const chats = (await c.query(api.chats.list as never, { userId: "leopard-dev-test-user-0001" } as never)) as any[];
  const sorted = [...chats].sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));
  const chat = sorted[0];
  const rows = (await c.query(api.messages.list as never, { chatId: chat._id } as never)) as any[];
  const last = rows[rows.length - 1];
  for (const r of rows) console.log(r.role, r.id, r.status, (r.parts ?? []).map((p) => `${p.type}:${p.state ?? "-"}`).join(", "));
  console.log(JSON.stringify({
    chatTitle: chat.title,
    rows: rows.length,
    lastRole: last.role,
    lastStatus: last.status,
    partTypes: (last.parts ?? []).map((p: any) => `${p.type}:${p.state ?? "-"}`),
  }, null, 1));
}
void main();
