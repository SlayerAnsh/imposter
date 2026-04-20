"use client";

import { Card } from "@imposter/ui";
import type { PublicPlayer } from "@imposter/game";

export function LobbyGuest({
  players,
  roomCode,
  peerId,
}: {
  players: PublicPlayer[];
  roomCode: string;
  peerId: string;
}) {
  return (
    <>
      <Card title={`Room ${roomCode}`}>
        <p>Connected. Waiting for the host to start the game.</p>
      </Card>
      <Card title={`Players (${players.length})`}>
        <ul className="imp-roster">
          {players.map((p) => (
            <li key={p.id}>
              <span>
                {p.displayName}
                {p.id === peerId ? " (you)" : ""}
              </span>
              <span className={`imp-pill ${p.connected ? "live" : ""}`}>
                {p.connected ? "connected" : "offline"}
              </span>
            </li>
          ))}
        </ul>
      </Card>
    </>
  );
}
