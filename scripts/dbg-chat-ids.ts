import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api";
import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
async function main() {
  const c = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);
  (c as any).setAdminAuth(process.env.CONVEX_DEPLOY_KEY!);
  const chats = (await c.query(api.chats.list as never, { userId: "leopard-dev-test-user-0001" } as never)) as any[];
  const ids = ["j572shwfp9fm9kw6030yrc1pb18d76f3", "j57a0nv590wxhrzw6mwfvqrx8n8d6gc4"];
  for (const id of ids) console.log(id, chats.some((ch) => ch._id === id) ? "EXISTS" : "MISSING");
}
void main();
