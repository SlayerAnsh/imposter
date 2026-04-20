"use client";

import { Button, Card } from "@imposter/ui";
import type { PlayerId, PublicPlayer, Role } from "@imposter/game";

export interface PendingActionLike {
  options: PlayerId[];
  allowSelf?: boolean;
}

export function NightScreen({
  round,
  role,
  players,
  pendingAction,
  onPick,
  lastResult,
  youId,
  prompt,
}: {
  round: number;
  role: Role | null;
  players: PublicPlayer[];
  pendingAction: PendingActionLike | null;
  onPick: (target: PlayerId) => void;
  lastResult: { target: PlayerId; isMafia?: boolean } | null;
  youId: PlayerId | null;
  prompt: string;
}) {
  if (!role || role === "villager") {
    return (
      <Card title={`Night ${round}`}>
        <div className="imp-sleep">
          <div className="moon">🌙</div>
          <p>You are asleep. Wait for morning.</p>
        </div>
      </Card>
    );
  }

  if (!pendingAction) {
    return (
      <Card title={`Night ${round}`}>
        <p>Waiting for others to make their choice…</p>
        {lastResult && role === "detective" ? (
          <p>
            Your investigation:{" "}
            <strong>
              {players.find((p) => p.id === lastResult.target)?.displayName}
            </strong>{" "}
            is {lastResult.isMafia ? "MAFIA" : "not mafia"}.
          </p>
        ) : null}
      </Card>
    );
  }

  const optionPlayers = pendingAction.options
    .map((id) => players.find((p) => p.id === id))
    .filter((p): p is PublicPlayer => !!p);

  return (
    <Card title={`Night ${round} — ${role.toUpperCase()}`}>
      <p>{prompt}</p>
      <div style={{ display: "grid", gap: 8 }}>
        {optionPlayers.map((p) => (
          <Button
            key={p.id}
            variant="secondary"
            onClick={() => onPick(p.id)}
          >
            {p.displayName}
            {p.id === youId ? " (yourself)" : ""}
          </Button>
        ))}
      </div>
    </Card>
  );
}
