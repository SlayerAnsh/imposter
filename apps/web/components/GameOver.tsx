"use client";

import { Button, Card } from "@imposter/ui";
import type { PlayerId, PublicPlayer, Role } from "@imposter/game";

export function GameOver({
  winner,
  reveal,
  players,
  onPlayAgain,
  showPlayAgain,
}: {
  winner: "mafia" | "town";
  reveal: { id: PlayerId; role: Role }[];
  players: PublicPlayer[];
  onPlayAgain?: () => void;
  showPlayAgain?: boolean;
}) {
  return (
    <>
      <Card title="Game over">
        <p style={{ fontSize: 22, fontWeight: 700, color: "var(--text)" }}>
          {winner === "mafia" ? "Mafia wins." : "Town wins."}
        </p>
      </Card>
      <Card title="Roles revealed">
        <ul className="imp-roster">
          {reveal.map((r) => {
            const p = players.find((x) => x.id === r.id);
            return (
              <li key={r.id}>
                <span>{p?.displayName ?? r.id}</span>
                <span className="imp-pill">{r.role}</span>
              </li>
            );
          })}
        </ul>
      </Card>
      {showPlayAgain && onPlayAgain ? (
        <Button variant="primary" size="lg" onClick={onPlayAgain}>
          Play again
        </Button>
      ) : null}
    </>
  );
}
