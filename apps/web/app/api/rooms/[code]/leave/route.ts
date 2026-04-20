import { NextResponse } from "next/server";
import { leaveRoom } from "@/server/room-registry";
import { LeaveBody } from "@/server/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  req: Request,
  ctx: { params: Promise<{ code: string }> },
) {
  const { code } = await ctx.params;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  const parsed = LeaveBody.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }
  leaveRoom(code, parsed.data.peerId);
  return NextResponse.json({ ok: true });
}
