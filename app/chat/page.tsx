import { redirect } from "next/navigation";

// /chat → redirect to /app (the authenticated app home)
export default function ChatRedirect() {
  redirect("/app");
}
