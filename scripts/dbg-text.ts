import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api";
import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

async function main() {
  const c = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);
  (c as any).setAdminAuth(process.env.CONVEX_DEPLOY_KEY!);
  const chats: any[] = await c.query(api.chats.list, {
    userId: "leopard-dev-test-user-0001",
  } as any);
  const chat = [...chats].sort(
    (a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0),
  )[0];
  const rows: any[] = await c.query(api.messages.list, {
    chatId: chat._id,
  } as any);
  const last = rows[rows.length - 1];
  console.log(JSON.stringify(last.parts, null, 1).slice(0, 3000));
}
void main();
