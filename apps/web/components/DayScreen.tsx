"use client";

import { Card } from "@imposter/ui";
import type { PublicPlayer } from "@imposter/game";

export function DayScreen({
  round,
  players,
  announcements,
  youId,
}: {
  round: number;
  players: PublicPlayer[];
  announcements: string[];
  youId: string | null;
}) {
  return (
    <>
      <Card title={`Day ${round}`}>
        {announcements.length === 0 ? (
          <p>The sun is rising…</p>
        ) : (
          announcements.slice(-3).map((a, i) => <p key={i}>{a}</p>)
        )}
      </Card>
      <Card title="Players">
        <ul className="imp-roster">
          {players.map((p) => (
            <li key={p.id} className={p.alive ? "" : "dead"}>
              <span>
                {p.displayName}
                {p.id === youId ? " (you)" : ""}
              </span>
              <span className="imp-pill">{p.alive ? "alive" : "dead"}</span>
            </li>
          ))}
        </ul>
      </Card>
    </>
  );
}
