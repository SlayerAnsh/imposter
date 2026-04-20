"use client";

import { Button, Card } from "@imposter/ui";
import type { GameState, PlayerId, RoleCounts } from "@imposter/game";
import { defaultRoleCounts, validateRoleCounts } from "@imposter/game";

interface Props {
  state: GameState;
  roomCode: string;
  hostId: PlayerId;
  onStart: () => void;
  onSetCounts: (counts: RoleCounts) => void;
}

export function LobbyHost({
  state,
  roomCode,
  hostId,
  onStart,
  onSetCounts,
}: Props) {
  const playerCount = state.players.length;
  const error = validateRoleCounts(state.roleCounts, playerCount);
  const canStart = playerCount >= 4 && error === null;

  return (
    <>
      <Card title="Room code">
        <div className="imp-room-code">{roomCode}</div>
        <p style={{ textAlign: "center", marginTop: 12 }}>
          Share this code. Guests open the site and tap "Join a room".
        </p>
      </Card>

      <Card title={`Players (${playerCount})`}>
        <ul className="imp-roster">
          {state.players.map((p) => (
            <li key={p.id}>
              <span>
                {p.displayName}
                {p.id === hostId ? " (you, host)" : ""}
              </span>
              <span className={`imp-pill ${p.connected ? "live" : ""}`}>
                {p.connected ? "connected" : "offline"}
              </span>
            </li>
          ))}
          {playerCount === 0 ? (
            <li style={{ color: "var(--muted)" }}>No one here yet.</li>
          ) : null}
        </ul>
      </Card>

      <Card title="Role counts">
        <RoleCountSliders
          counts={state.roleCounts}
          playerCount={playerCount}
          onChange={onSetCounts}
        />
        {error ? <p className="imp-error">{error}</p> : null}
        <div style={{ marginTop: 10, fontSize: 13, color: "var(--muted)" }}>
          Default for {playerCount} players:{" "}
          {JSON.stringify(defaultRoleCounts(Math.max(playerCount, 4)))}
        </div>
      </Card>

      <Button
        variant="primary"
        size="lg"
        disabled={!canStart}
        onClick={onStart}
      >
        Start game
      </Button>
      {playerCount < 4 ? (
        <p style={{ marginTop: 8 }}>Need at least 4 players to start.</p>
      ) : null}
    </>
  );
}

function RoleCountSliders({
  counts,
  playerCount,
  onChange,
}: {
  counts: RoleCounts;
  playerCount: number;
  onChange: (c: RoleCounts) => void;
}) {
  const max = Math.max(playerCount, 1);
  const set = (key: keyof RoleCounts, value: number) => {
    const next = { ...counts, [key]: value };
    next.villager = Math.max(
      0,
      playerCount - next.mafia - next.detective - next.doctor,
    );
    onChange(next);
  };
  return (
    <div>
      <CounterRow
        label="Mafia"
        value={counts.mafia}
        min={1}
        max={Math.max(1, Math.floor((max - 1) / 2))}
        onChange={(v) => set("mafia", v)}
      />
      <CounterRow
        label="Detective"
        value={counts.detective}
        min={0}
        max={1}
        onChange={(v) => set("detective", v)}
      />
      <CounterRow
        label="Doctor"
        value={counts.doctor}
        min={0}
        max={1}
        onChange={(v) => set("doctor", v)}
      />
      <CounterRow
        label="Villagers"
        value={counts.villager}
        min={0}
        max={max}
        onChange={() => {
          /* derived */
        }}
        disabled
      />
    </div>
  );
}

function CounterRow({
  label,
  value,
  min,
  max,
  onChange,
  disabled,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
  disabled?: boolean;
}) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        padding: "6px 0",
      }}
    >
      <span>{label}</span>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <Button
          size="sm"
          disabled={disabled || value <= min}
          onClick={() => onChange(value - 1)}
        >
          −
        </Button>
        <span style={{ minWidth: 24, textAlign: "center" }}>{value}</span>
        <Button
          size="sm"
          disabled={disabled || value >= max}
          onClick={() => onChange(value + 1)}
        >
          +
        </Button>
      </div>
    </div>
  );
}
