import type {
  ClientToServerSignal,
  CreateRoomResponse,
  JoinRoomResponse,
  PeerId,
  ServerToClientSignal,
} from "./signaling-protocol";

export interface SignalingClientOptions {
  baseUrl?: string;
  roomCode: string;
  peerId: PeerId;
  onMessage: (msg: ServerToClientSignal) => void;
  onError?: (err: unknown) => void;
  onOpen?: () => void;
}

export class SignalingClient {
  private es: EventSource | null = null;
  private closed = false;
  private readonly base: string;
  constructor(private readonly opts: SignalingClientOptions) {
    this.base = opts.baseUrl ?? "";
  }

  open(): void {
    const url =
      `${this.base}/api/rooms/${encodeURIComponent(this.opts.roomCode)}/stream` +
      `?peerId=${encodeURIComponent(this.opts.peerId)}`;
    const es = new EventSource(url);
    this.es = es;
    es.onopen = () => this.opts.onOpen?.();
    es.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data) as ServerToClientSignal;
        this.opts.onMessage(msg);
      } catch (err) {
        this.opts.onError?.(err);
      }
    };
    es.onerror = (err) => {
      if (!this.closed) this.opts.onError?.(err);
    };
  }

  async send(signal: ClientToServerSignal): Promise<void> {
    const url =
      `${this.base}/api/rooms/${encodeURIComponent(this.opts.roomCode)}/relay`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(signal),
    });
    if (!res.ok) {
      throw new Error(`relay failed: ${res.status}`);
    }
  }

  close(): void {
    this.closed = true;
    this.es?.close();
    this.es = null;
  }
}

export async function createRoom(
  baseUrl = "",
): Promise<CreateRoomResponse> {
  const res = await fetch(`${baseUrl}/api/rooms`, { method: "POST" });
  if (!res.ok) throw new Error(`create room failed: ${res.status}`);
  return (await res.json()) as CreateRoomResponse;
}

export async function joinRoom(
  roomCode: string,
  displayName: string,
  baseUrl = "",
): Promise<JoinRoomResponse> {
  const res = await fetch(
    `${baseUrl}/api/rooms/${encodeURIComponent(roomCode)}/join`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ displayName }),
    },
  );
  if (!res.ok) throw new Error(`join failed: ${res.status}`);
  return (await res.json()) as JoinRoomResponse;
}

export async function leaveRoom(
  roomCode: string,
  peerId: PeerId,
  baseUrl = "",
): Promise<void> {
  await fetch(
    `${baseUrl}/api/rooms/${encodeURIComponent(roomCode)}/leave`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ peerId }),
      keepalive: true,
    },
  );
}
