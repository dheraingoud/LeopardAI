import { NextRequest } from "next/server";
import { POST as generateVideoPOST } from "@/app/api/generate/video/route";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  return generateVideoPOST(request);
}
