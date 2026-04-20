"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  HostPeerManager,
  SignalingClient,
  createRoom,
  type ServerToClientSignal,
} from "@imposter/net";
import {
  createInitialState,
  detectiveResult,
  isDayVoteComplete,
  isNightComplete,
  phasePrompt,
  reduce,
  toPublicPlayer,
  type Event,
  type GameState,
  type GuestToHostMessage,
  type HostToGuestMessage,
  type Player,
  type PlayerId,
  type Role,
} from "@imposter/game";

export interface UseHostEngineResult {
  state: GameState | null;
  roomCode: string | null;
  hostId: PlayerId | null;
  selfRole: Role | null;
  selfActionResult: { target: PlayerId; isMafia: boolean } | null;
  error: string | null;
  starting: boolean;
  createAndJoin: (displayName: string) => Promise<void>;
  startGame: () => void;
  dispatch: (ev: Event) => void;
  hostAction: (ev: Event) => void;
}

export function useHostEngine(): UseHostEngineResult {
  const [state, setState] = useState<GameState | null>(null);
  const [roomCode, setRoomCode] = useState<string | null>(null);
  const [hostId, setHostId] = useState<PlayerId | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [selfRole, setSelfRole] = useState<Role | null>(null);
  const [selfActionResult, setSelfActionResult] = useState<
    { target: PlayerId; isMafia: boolean } | null
  >(null);

  const signalingRef = useRef<SignalingClient | null>(null);
  const peersRef = useRef<HostPeerManager | null>(null);
  const stateRef = useRef<GameState | null>(null);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const broadcast = useCallback((msg: HostToGuestMessage) => {
    peersRef.current?.broadcast(JSON.stringify(msg));
  }, []);

  const sendTo = useCallback(
    (peerId: PlayerId, msg: HostToGuestMessage) => {
      if (peerId === hostId) return; // host doesn't message itself
      peersRef.current?.send(peerId, JSON.stringify(msg));
    },
    [hostId],
  );

  const broadcastRoster = useCallback(
    (s: GameState) => {
      broadcast({
        type: "ROSTER_UPDATE",
        players: s.players.map(toPublicPlayer),
      });
    },
    [broadcast],
  );

  const announcePhase = useCallback(
    (s: GameState, prev: GameState | null) => {
      if (!prev || s.phase !== prev.phase) {
        broadcast({
          type: "PHASE",
          phase: s.phase,
          round: s.round,
          prompt: phasePrompt(s.phase),
        });
      }
    },
    [broadcast],
  );

  const sendRoles = useCallback(
    (s: GameState) => {
      const mafia = s.players.filter((p) => p.role === "mafia").map((p) => p.id);
      for (const p of s.players) {
        if (!p.role) continue;
        const msg: HostToGuestMessage = {
          type: "YOUR_ROLE",
          role: p.role,
          teammates: p.role === "mafia" ? mafia : undefined,
        };
        if (p.id === hostId) {
          setSelfRole(p.role);
          continue;
        }
        sendTo(p.id, msg);
      }
    },
    [hostId, sendTo],
  );

  const announceVictim = useCallback(
    (s: GameState) => {
      let text = "";
      if (s.lastNightVictim === "none") {
        text = "The night was quiet. No one died.";
      } else if (s.lastNightVictim === "saved") {
        text =
          "The mafia struck, but the doctor saved their target in time.";
      } else if (s.lastNightVictim) {
        const victim = s.players.find((p) => p.id === s.lastNightVictim);
        if (victim) {
          text = `${victim.displayName} was killed in the night.`;
        }
      }
      if (text) broadcast({ type: "ANNOUNCEMENT", text });
    },
    [broadcast],
  );

  const announceDayOutcome = useCallback(
    (s: GameState) => {
      const text = s.lastDayEliminated
        ? (() => {
            const p = s.players.find((x) => x.id === s.lastDayEliminated);
            return p
              ? `${p.displayName} was voted out. They were ${p.role}.`
              : "";
          })()
        : "The vote was a tie. No one is eliminated.";
      if (text) broadcast({ type: "ANNOUNCEMENT", text });
    },
    [broadcast],
  );

  const announceGameOver = useCallback(
    (s: GameState) => {
      broadcast({
        type: "GAME_OVER",
        winner: s.winner!,
        reveal: s.players
          .filter((p) => p.role)
          .map((p) => ({ id: p.id, role: p.role as Role })),
      });
    },
    [broadcast],
  );

  const promptNightActors = useCallback(
    (s: GameState) => {
      const aliveIds = s.players.filter((p) => p.alive).map((p) => p.id);
      for (const p of s.players) {
        if (!p.alive) continue;
        if (p.role === "mafia") {
          const opts = aliveIds.filter(
            (id) => s.players.find((x) => x.id === id)?.role !== "mafia",
          );
          if (p.id === hostId) continue;
          sendTo(p.id, {
            type: "PRIVATE_ACTION_REQUEST",
            phase: "night",
            options: opts,
          });
        } else if (p.role === "detective") {
          const opts = aliveIds.filter((id) => id !== p.id);
          if (p.id !== hostId) {
            sendTo(p.id, {
              type: "PRIVATE_ACTION_REQUEST",
              phase: "night",
              options: opts,
            });
          }
        } else if (p.role === "doctor") {
          const allowSelf = !s.night.doctorSelfSaveUsed;
          const opts = aliveIds.filter((id) => allowSelf || id !== p.id);
          if (p.id !== hostId) {
            sendTo(p.id, {
              type: "PRIVATE_ACTION_REQUEST",
              phase: "night",
              options: opts,
              allowSelf,
            });
          }
        }
      }
    },
    [hostId, sendTo],
  );

  const promptDayVote = useCallback(
    (s: GameState) => {
      const aliveIds = s.players.filter((p) => p.alive).map((p) => p.id);
      for (const p of s.players) {
        if (!p.alive) continue;
        if (p.id === hostId) continue;
        sendTo(p.id, {
          type: "PRIVATE_ACTION_REQUEST",
          phase: "day_vote",
          options: aliveIds,
        });
      }
    },
    [hostId, sendTo],
  );

  const apply = useCallback(
    (ev: Event): GameState | null => {
      const prev = stateRef.current;
      if (!prev) return null;
      const next = reduce(prev, ev);
      if (next === prev) return prev;
      stateRef.current = next;
      setState(next);

      // side-effects on phase transitions
      if (next.phase !== prev.phase) {
        if (next.phase === "night" && prev.phase === "lobby") {
          // just started: send roles
          sendRoles(next);
        }
        announcePhase(next, prev);
        if (next.phase === "night") {
          promptNightActors(next);
        } else if (next.phase === "day_announce") {
          announceVictim(next);
        } else if (next.phase === "day_vote") {
          promptDayVote(next);
        } else if (next.phase === "day_resolve") {
          announceDayOutcome(next);
        } else if (next.phase === "game_over") {
          announceGameOver(next);
        }
      }

      // roster updates on changes
      if (next.players !== prev.players) {
        broadcastRoster(next);
      }
      return next;
    },
    [
      announceDayOutcome,
      announceGameOver,
      announcePhase,
      announceVictim,
      broadcastRoster,
      promptDayVote,
      promptNightActors,
      sendRoles,
    ],
  );

  // auto-advance: watch for completion of night / day-vote phases
  useEffect(() => {
    if (!state) return;
    if (state.phase === "night" && isNightComplete(state)) {
      const detectiveTarget = state.night.detectiveTarget;
      if (detectiveTarget) {
        const det = state.players.find((p) => p.role === "detective");
        if (det && det.id !== hostId) {
          const r = detectiveResult(state, detectiveTarget);
          if (r) {
            sendTo(det.id, {
              type: "PRIVATE_ACTION_RESULT",
              phase: "night",
              target: r.target,
              isMafia: r.isMafia,
            });
          }
        } else if (det && det.id === hostId) {
          const r = detectiveResult(state, detectiveTarget);
          if (r) setSelfActionResult(r);
        }
      }
      const t = setTimeout(() => apply({ type: "RESOLVE_NIGHT" }), 400);
      return () => clearTimeout(t);
    }
    if (state.phase === "day_announce") {
      const t = setTimeout(() => apply({ type: "ADVANCE_TO_VOTE" }), 2500);
      return () => clearTimeout(t);
    }
    if (state.phase === "day_vote" && isDayVoteComplete(state)) {
      const t = setTimeout(() => apply({ type: "RESOLVE_DAY" }), 400);
      return () => clearTimeout(t);
    }
    if (state.phase === "day_resolve") {
      const t = setTimeout(() => apply({ type: "NEXT_ROUND" }), 3500);
      return () => clearTimeout(t);
    }
  }, [state, apply, hostId, sendTo]);

  const handleGuestMessage = useCallback(
    (peerId: PlayerId, raw: string) => {
      let msg: GuestToHostMessage;
      try {
        msg = JSON.parse(raw) as GuestToHostMessage;
      } catch {
        return;
      }
      switch (msg.type) {
        case "HELLO":
          apply({
            type: "PLAYER_JOINED",
            id: peerId,
            displayName: msg.displayName,
          });
          return;
        case "ACTION": {
          const s = stateRef.current;
          if (!s) return;
          const actor = s.players.find((p) => p.id === peerId);
          if (!actor || !actor.role || !actor.alive) return;
          if (s.phase !== "night" || !msg.target) return;
          if (actor.role === "mafia") {
            apply({ type: "MAFIA_VOTE", by: peerId, target: msg.target });
          } else if (actor.role === "detective") {
            apply({
              type: "DETECTIVE_PICK",
              by: peerId,
              target: msg.target,
            });
          } else if (actor.role === "doctor") {
            apply({ type: "DOCTOR_PICK", by: peerId, target: msg.target });
          }
          return;
        }
        case "VOTE":
          apply({ type: "DAY_VOTE", by: peerId, target: msg.target });
          return;
        case "HEARTBEAT":
          return;
      }
    },
    [apply],
  );

  const createAndJoin = useCallback(
    async (displayName: string) => {
      if (signalingRef.current) return;
      setError(null);
      try {
        const { roomCode: code, hostId: hid } = await createRoom();
        setRoomCode(code);
        setHostId(hid);
        const initial = createInitialState(hid, code);
        stateRef.current = initial;
        setState(initial);

        const signaling = new SignalingClient({
          roomCode: code,
          peerId: hid,
          onMessage: (m: ServerToClientSignal) => {
            peersRef.current?.handleSignal(m);
          },
          onError: (err) => setError(String(err)),
        });
        signalingRef.current = signaling;

        const peers = new HostPeerManager({
          signaling,
          hostId: hid,
          onPeerReady: (h) => {
            // roster update so they see who is here
            const s = stateRef.current;
            if (s) {
              peers.send(
                h.peerId,
                JSON.stringify({
                  type: "ROSTER_UPDATE",
                  players: s.players.map(toPublicPlayer),
                } satisfies HostToGuestMessage),
              );
            }
          },
          onPeerClosed: (peerId) => {
            apply({ type: "PLAYER_LEFT", id: peerId });
          },
          onChannelMessage: handleGuestMessage,
          onError: (err) => setError(String(err)),
        });
        peersRef.current = peers;

        signaling.open();

        // add host as a player
        apply({ type: "PLAYER_JOINED", id: hid, displayName });
      } catch (err) {
        setError(String(err));
      }
    },
    [apply, handleGuestMessage],
  );

  const startGame = useCallback(() => {
    setStarting(true);
    apply({ type: "START_GAME" });
    setStarting(false);
  }, [apply]);

  const dispatch = useCallback(
    (ev: Event) => {
      apply(ev);
    },
    [apply],
  );

  const hostAction = useCallback(
    (ev: Event) => {
      const s = stateRef.current;
      if (!s || !hostId) return;
      const self = s.players.find((p: Player) => p.id === hostId);
      if (!self) return;
      const next = apply(ev);
      // if host was the detective, surface the result locally
      if (
        next &&
        self.role === "detective" &&
        ev.type === "DETECTIVE_PICK" &&
        next.night.detectiveTarget
      ) {
        const r = detectiveResult(next, next.night.detectiveTarget);
        if (r) setSelfActionResult(r);
      }
    },
    [apply, hostId],
  );

  // cleanup on unmount
  useEffect(() => {
    return () => {
      peersRef.current?.closeAll();
      signalingRef.current?.close();
    };
  }, []);

  return {
    state,
    roomCode,
    hostId,
    selfRole,
    selfActionResult,
    error,
    starting,
    createAndJoin,
    startGame,
    dispatch,
    hostAction,
  };
}
