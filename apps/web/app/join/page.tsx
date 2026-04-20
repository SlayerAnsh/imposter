"use client";

import Link from "next/link";
import { Card } from "@imposter/ui";
import { useGuestClient } from "@/hooks/useGuestClient";
import { JoinScreen } from "@/components/JoinScreen";
import { LobbyGuest } from "@/components/LobbyGuest";
import { NightScreen } from "@/components/NightScreen";
import { DayScreen } from "@/components/DayScreen";
import { VotePanel } from "@/components/VotePanel";
import { GameOver } from "@/components/GameOver";

export default function JoinPage() {
  const client = useGuestClient();

  if (client.status === "idle" || client.status === "error") {
    return (
      <main>
        <Link href="/">← Back</Link>
        <h1>Join a room</h1>
        <JoinScreen
          onJoin={client.join}
          error={client.error}
          status={client.status}
        />
      </main>
    );
  }

  if (client.status === "joining" || client.status === "connecting") {
    return (
      <main>
        <h1>Connecting…</h1>
        <Card>
          <p>
            Joining room{" "}
            <strong>{client.roomCode}</strong>. Negotiating peer connection
            with the host.
          </p>
        </Card>
      </main>
    );
  }

  // connected
  const phase = client.phase ?? "lobby";
  const you = client.peerId;

  return (
    <main>
      <h1>imposter</h1>

      {phase === "lobby" ? (
        <LobbyGuest
          players={client.players}
          roomCode={client.roomCode!}
          peerId={client.peerId!}
        />
      ) : null}

      {phase === "night" ? (
        <NightScreen
          round={client.round}
          role={client.role}
          players={client.players}
          pendingAction={client.pendingAction}
          onPick={client.sendAction}
          lastResult={client.actionResult}
          youId={you}
          prompt={client.prompt}
        />
      ) : null}

      {phase === "day_announce" ? (
        <DayScreen
          round={client.round}
          players={client.players}
          announcements={client.announcements}
          youId={you}
        />
      ) : null}

      {phase === "day_vote" ? (
        <>
          <DayScreen
            round={client.round}
            players={client.players}
            announcements={client.announcements}
            youId={you}
          />
          {client.pendingAction ? (
            <VotePanel
              options={client.pendingAction.options}
              players={client.players}
              onVote={client.sendVote}
              youId={you}
              alreadyVoted={false}
            />
          ) : (
            <Card>
              <p>Waiting for everyone to vote…</p>
            </Card>
          )}
        </>
      ) : null}

      {phase === "day_resolve" ? (
        <DayScreen
          round={client.round}
          players={client.players}
          announcements={client.announcements}
          youId={you}
        />
      ) : null}

      {client.gameOver ? (
        <GameOver
          winner={client.gameOver.winner}
          reveal={client.gameOver.reveal}
          players={client.players}
        />
      ) : null}
    </main>
  );
}
