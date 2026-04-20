"use client";

import { Button, Card } from "@imposter/ui";
import type { PlayerId, PublicPlayer } from "@imposter/game";

export function VotePanel({
  options,
  players,
  onVote,
  youId,
  alreadyVoted,
}: {
  options: PlayerId[];
  players: PublicPlayer[];
  onVote: (target: PlayerId | "skip") => void;
  youId: PlayerId | null;
  alreadyVoted: boolean;
}) {
  const optionPlayers = options
    .map((id) => players.find((p) => p.id === id))
    .filter((p): p is PublicPlayer => !!p);
  if (alreadyVoted) {
    return (
      <Card title="Vote cast">
        <p>Waiting for the rest of the town to vote…</p>
      </Card>
    );
  }
  return (
    <Card title="Vote">
      <p>Who do you suspect? (Skip if you are not sure.)</p>
      <div style={{ display: "grid", gap: 8 }}>
        {optionPlayers.map((p) => (
          <Button
            key={p.id}
            variant="secondary"
            onClick={() => onVote(p.id)}
          >
            {p.displayName}
            {p.id === youId ? " (yourself)" : ""}
          </Button>
        ))}
        <Button onClick={() => onVote("skip")}>Skip</Button>
      </div>
    </Card>
  );
}
