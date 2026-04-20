"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Button, Card } from "@imposter/ui";
import {
  isDayVoteComplete,
  phasePrompt,
  toPublicPlayer,
  type PlayerId,
} from "@imposter/game";
import { useHostEngine } from "@/hooks/useHostEngine";
import { LobbyHost } from "@/components/LobbyHost";
import { NightScreen } from "@/components/NightScreen";
import { DayScreen } from "@/components/DayScreen";
import { VotePanel } from "@/components/VotePanel";
import { GameOver } from "@/components/GameOver";

export default function HostPage() {
  const {
    state,
    roomCode,
    hostId,
    selfRole,
    selfActionResult,
    error,
    createAndJoin,
    startGame,
    dispatch,
    hostAction,
  } = useHostEngine();
  const [name, setName] = useState("");

  const publicPlayers = useMemo(
    () => state?.players.map(toPublicPlayer) ?? [],
    [state?.players],
  );

  const announcements = useMemo(() => {
    if (!state) return [];
    const out: string[] = [];
    if (state.lastNightVictim === "none")
      out.push("The night was quiet. No one died.");
    else if (state.lastNightVictim === "saved")
      out.push("The mafia struck, but the doctor saved the target.");
    else if (state.lastNightVictim) {
      const v = state.players.find((p) => p.id === state.lastNightVictim);
      if (v) out.push(`${v.displayName} was killed in the night.`);
    }
    if (state.lastDayEliminated) {
      const v = state.players.find((p) => p.id === state.lastDayEliminated);
      if (v) out.push(`${v.displayName} was voted out. They were ${v.role}.`);
    }
    return out;
  }, [state]);

  if (!state || !roomCode || !hostId) {
    return (
      <main>
        <Link href="/">← Back</Link>
        <h1>Host a room</h1>
        <Card title="Your name">
          <label>
            <input
              className="imp-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your display name"
              maxLength={32}
            />
          </label>
          <div style={{ marginTop: 10 }}>
            <Button
              variant="primary"
              size="lg"
              disabled={!name.trim()}
              onClick={() => createAndJoin(name.trim())}
            >
              Create room
            </Button>
          </div>
          {error ? <p className="imp-error">{error}</p> : null}
        </Card>
      </main>
    );
  }

  const self = state.players.find((p) => p.id === hostId);
  const selfAlive = self?.alive ?? true;

  const hostPendingNight = (() => {
    if (state.phase !== "night" || !selfRole || !selfAlive) return null;
    const aliveIds = state.players.filter((p) => p.alive).map((p) => p.id);
    if (selfRole === "mafia") {
      const opts = aliveIds.filter(
        (id) => state.players.find((x) => x.id === id)?.role !== "mafia",
      );
      if (state.night.mafiaVotes[hostId]) return null;
      return { options: opts };
    }
    if (selfRole === "detective") {
      if (state.night.detectiveTarget) return null;
      return { options: aliveIds.filter((id) => id !== hostId) };
    }
    if (selfRole === "doctor") {
      if (state.night.doctorTarget) return null;
      const allowSelf = !state.night.doctorSelfSaveUsed;
      return {
        options: aliveIds.filter((id) => allowSelf || id !== hostId),
        allowSelf,
      };
    }
    return null;
  })();

  const hostPendingVote =
    state.phase === "day_vote" && selfAlive && !state.day.votes[hostId];

  return (
    <main>
      <h1>imposter (host)</h1>

      {state.phase === "lobby" ? (
        <LobbyHost
          state={state}
          roomCode={roomCode}
          hostId={hostId}
          onStart={startGame}
          onSetCounts={(counts) =>
            dispatch({ type: "SET_ROLE_COUNTS", counts })
          }
        />
      ) : null}

      {state.phase === "assigning" ? (
        <Card title="Dealing roles…">
          <p>Dealing cards.</p>
        </Card>
      ) : null}

      {state.phase === "night" ? (
        <>
          <NightScreen
            round={state.round}
            role={selfRole}
            players={publicPlayers}
            pendingAction={hostPendingNight}
            onPick={(target: PlayerId) => {
              if (!selfRole) return;
              if (selfRole === "mafia")
                hostAction({ type: "MAFIA_VOTE", by: hostId, target });
              else if (selfRole === "detective")
                hostAction({ type: "DETECTIVE_PICK", by: hostId, target });
              else if (selfRole === "doctor")
                hostAction({ type: "DOCTOR_PICK", by: hostId, target });
            }}
            lastResult={selfActionResult}
            youId={hostId}
            prompt={phasePrompt("night", selfRole ?? undefined)}
          />
        </>
      ) : null}

      {state.phase === "day_announce" ? (
        <DayScreen
          round={state.round}
          players={publicPlayers}
          announcements={announcements}
          youId={hostId}
        />
      ) : null}

      {state.phase === "day_vote" ? (
        <>
          <DayScreen
            round={state.round}
            players={publicPlayers}
            announcements={announcements}
            youId={hostId}
          />
          {selfAlive ? (
            <VotePanel
              options={state.players
                .filter((p) => p.alive)
                .map((p) => p.id)}
              players={publicPlayers}
              onVote={(target) =>
                dispatch({ type: "DAY_VOTE", by: hostId, target })
              }
              youId={hostId}
              alreadyVoted={!hostPendingVote}
            />
          ) : (
            <Card title="You are dead">
              <p>Watch the living vote it out.</p>
            </Card>
          )}
          {isDayVoteComplete(state) ? (
            <p style={{ color: "var(--muted)" }}>Tallying votes…</p>
          ) : null}
        </>
      ) : null}

      {state.phase === "day_resolve" ? (
        <DayScreen
          round={state.round}
          players={publicPlayers}
          announcements={announcements}
          youId={hostId}
        />
      ) : null}

      {state.phase === "game_over" && state.winner ? (
        <GameOver
          winner={state.winner}
          reveal={state.players
            .filter((p) => p.role)
            .map((p) => ({ id: p.id, role: p.role! }))}
          players={publicPlayers}
          showPlayAgain
          onPlayAgain={() => dispatch({ type: "RESET_TO_LOBBY" })}
        />
      ) : null}

      {error ? <p className="imp-error">{error}</p> : null}
    </main>
  );
}
