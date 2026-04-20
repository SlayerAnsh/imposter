"use client";

import { useState } from "react";
import { Button, Card } from "@imposter/ui";

export function JoinScreen({
  onJoin,
  error,
  status,
}: {
  onJoin: (roomCode: string, displayName: string) => void;
  error: string | null;
  status: string;
}) {
  const [roomCode, setRoomCode] = useState("");
  const [displayName, setDisplayName] = useState("");
  const busy = status === "joining" || status === "connecting";

  return (
    <Card title="Join a room">
      <label style={{ display: "block", marginBottom: 10 }}>
        <div style={{ marginBottom: 4 }}>Room code</div>
        <input
          className="imp-input"
          autoCapitalize="characters"
          autoCorrect="off"
          value={roomCode}
          onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
          placeholder="e.g. ABC23"
          maxLength={6}
        />
      </label>
      <label style={{ display: "block", marginBottom: 10 }}>
        <div style={{ marginBottom: 4 }}>Your name</div>
        <input
          className="imp-input"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          placeholder="Alice"
          maxLength={32}
        />
      </label>
      <Button
        variant="primary"
        size="lg"
        disabled={!roomCode || !displayName || busy}
        onClick={() => onJoin(roomCode.trim(), displayName.trim())}
      >
        {busy ? "Connecting…" : "Join"}
      </Button>
      {error ? <p className="imp-error">{error}</p> : null}
    </Card>
  );
}
