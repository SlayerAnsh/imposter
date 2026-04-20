import { customAlphabet } from "nanoid";
import type {
  ClientToServerSignal,
  PeerId,
  ServerToClientSignal,
} from "@imposter/net";
import type { SseChannel } from "./sse.js";

const roomAlphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const genRoomCode = customAlphabet(roomAlphabet, 5);
const genPeerId = customAlphabet(
  "abcdefghijklmnopqrstuvwxyz0123456789",
  10,
);

const ROOM_IDLE_MS = 1000 * 60 * 10;

interface Peer {
  id: PeerId;
  displayName: string;
  channel?: SseChannel;
}

interface Room {
  code: string;
  hostId: PeerId;
  peers: Map<PeerId, Peer>;
  createdAt: number;
  lastActivityAt: number;
  idleTimer?: ReturnType<typeof setTimeout>;
}

type RegistryGlobal = {
  __imposterRegistry?: Map<string, Room>;
};

const g = globalThis as unknown as RegistryGlobal;
const rooms: Map<string, Room> = g.__imposterRegistry ?? new Map();
g.__imposterRegistry = rooms;

function touch(room: Room) {
  room.lastActivityAt = Date.now();
  if (room.idleTimer) clearTimeout(room.idleTimer);
  room.idleTimer = setTimeout(() => {
    closeRoom(room.code);
  }, ROOM_IDLE_MS);
}

export function createRoom(): { roomCode: string; hostId: PeerId } {
  let code = genRoomCode();
  while (rooms.has(code)) code = genRoomCode();
  const hostId = "host-" + genPeerId();
  const room: Room = {
    code,
    hostId,
    peers: new Map([
      [hostId, { id: hostId, displayName: "Host" }],
    ]),
    createdAt: Date.now(),
    lastActivityAt: Date.now(),
  };
  rooms.set(code, room);
  touch(room);
  return { roomCode: code, hostId };
}

export function joinRoomEntry(
  code: string,
  displayName: string,
): { peerId: PeerId; hostId: PeerId } | null {
  const room = rooms.get(code);
  if (!room) return null;
  const peerId = "g-" + genPeerId();
  room.peers.set(peerId, { id: peerId, displayName });
  touch(room);
  // notify host of new peer
  const host = room.peers.get(room.hostId);
  host?.channel?.write({
    type: "peer_joined",
    peerId,
    displayName,
  });
  return { peerId, hostId: room.hostId };
}

export function attachChannel(
  code: string,
  peerId: PeerId,
  channel: SseChannel,
): boolean {
  const room = rooms.get(code);
  if (!room) return false;
  const peer = room.peers.get(peerId);
  if (!peer) return false;
  peer.channel?.close();
  peer.channel = channel;
  touch(room);
  channel.write({
    type: "hello",
    peerId,
    role: peerId === room.hostId ? "host" : "guest",
  });

  // If a guest's SSE attaches after it was added but before the host had
  // opened its channel, re-send peer_joined so the host picks it up.
  if (peerId === room.hostId) {
    for (const p of room.peers.values()) {
      if (p.id !== room.hostId) {
        channel.write({
          type: "peer_joined",
          peerId: p.id,
          displayName: p.displayName,
        });
      }
    }
  }

  void channel.closed.then(() => {
    if (peer.channel === channel) {
      peer.channel = undefined;
    }
  });
  return true;
}

export function leaveRoom(code: string, peerId: PeerId): void {
  const room = rooms.get(code);
  if (!room) return;
  const peer = room.peers.get(peerId);
  if (!peer) return;
  peer.channel?.close();
  room.peers.delete(peerId);
  touch(room);

  if (peerId === room.hostId) {
    // host left → tear down room
    closeRoom(code);
    return;
  }
  // notify host
  const host = room.peers.get(room.hostId);
  host?.channel?.write({ type: "peer_left", peerId });
}

export function closeRoom(code: string): void {
  const room = rooms.get(code);
  if (!room) return;
  if (room.idleTimer) clearTimeout(room.idleTimer);
  for (const peer of room.peers.values()) {
    peer.channel?.close();
  }
  rooms.delete(code);
}

export function relay(
  code: string,
  signal: ClientToServerSignal,
): { ok: true } | { ok: false; status: number; error: string } {
  const room = rooms.get(code);
  if (!room) return { ok: false, status: 404, error: "room not found" };
  const from = room.peers.get(signal.from);
  if (!from) return { ok: false, status: 403, error: "sender not in room" };
  const to = room.peers.get(signal.to);
  if (!to) return { ok: false, status: 404, error: "target not in room" };
  touch(room);
  const msg: ServerToClientSignal = signal;
  if (!to.channel) {
    return { ok: false, status: 409, error: "target not connected" };
  }
  to.channel.write(msg);
  return { ok: true };
}

export function roomExists(code: string): boolean {
  return rooms.has(code);
}

export function peerInRoom(code: string, peerId: PeerId): boolean {
  return rooms.get(code)?.peers.has(peerId) ?? false;
}

export function listPeers(
  code: string,
): { id: PeerId; displayName: string }[] {
  const room = rooms.get(code);
  if (!room) return [];
  return [...room.peers.values()].map((p) => ({
    id: p.id,
    displayName: p.displayName,
  }));
}
