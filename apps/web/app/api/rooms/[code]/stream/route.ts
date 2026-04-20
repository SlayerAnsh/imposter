import { attachChannel, peerInRoom } from "@/server/room-registry";
import { createSseChannel, SSE_HEADERS } from "@/server/sse";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PING_INTERVAL_MS = 20_000;

export async function GET(
  req: Request,
  ctx: { params: Promise<{ code: string }> },
) {
  const { code } = await ctx.params;
  const url = new URL(req.url);
  const peerId = url.searchParams.get("peerId");
  if (!peerId) {
    return new Response(JSON.stringify({ error: "peerId required" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }
  if (!peerInRoom(code, peerId)) {
    return new Response(JSON.stringify({ error: "not in room" }), {
      status: 404,
      headers: { "content-type": "application/json" },
    });
  }

  const channel = createSseChannel();
  const attached = attachChannel(code, peerId, channel);
  if (!attached) {
    channel.close();
    return new Response(JSON.stringify({ error: "not in room" }), {
      status: 404,
      headers: { "content-type": "application/json" },
    });
  }

  const ping = setInterval(() => channel.ping(), PING_INTERVAL_MS);

  const cleanup = () => {
    clearInterval(ping);
    channel.close();
  };

  req.signal.addEventListener("abort", cleanup);
  void channel.closed.then(cleanup);

  return new Response(channel.stream, { headers: SSE_HEADERS });
}
