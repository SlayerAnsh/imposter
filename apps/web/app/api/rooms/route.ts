import { NextResponse } from "next/server";
import { createRoom } from "@/server/room-registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  const { roomCode, hostId } = createRoom();
  return NextResponse.json({ roomCode, hostId });
}
