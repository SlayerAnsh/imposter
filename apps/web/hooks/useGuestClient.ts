"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  GuestPeer,
  SignalingClient,
  joinRoom,
  type ServerToClientSignal,
} from "@imposter/net";
import type {
  GuestToHostMessage,
  HostToGuestMessage,
  Phase,
  PlayerId,
  PublicPlayer,
  Role,
} from "@imposter/game";

export interface PendingAction {
  phase: Phase;
  options: PlayerId[];
  allowSelf?: boolean;
}

export interface ActionResult {
  target: PlayerId;
  isMafia?: boolean;
}

export interface GuestClientState {
  status: "idle" | "joining" | "connecting" | "connected" | "error";
  peerId: PlayerId | null;
  hostId: PlayerId | null;
  roomCode: string | null;
  error: string | null;
  players: PublicPlayer[];
  role: Role | null;
  teammates: PlayerId[];
  phase: Phase | null;
  round: number;
  prompt: string;
  pendingAction: PendingAction | null;
  actionResult: ActionResult | null;
  announcements: string[];
  gameOver: {
    winner: "mafia" | "town";
    reveal: { id: PlayerId; role: Role }[];
  } | null;
}

const initialState: GuestClientState = {
  status: "idle",
  peerId: null,
  hostId: null,
  roomCode: null,
  error: null,
  players: [],
  role: null,
  teammates: [],
  phase: null,
  round: 0,
  prompt: "",
  pendingAction: null,
  actionResult: null,
  announcements: [],
  gameOver: null,
};

export interface UseGuestClientResult extends GuestClientState {
  join: (roomCode: string, displayName: string) => Promise<void>;
  sendAction: (target: PlayerId) => void;
  sendVote: (target: PlayerId | "skip") => void;
  leave: () => void;
}

export function useGuestClient(): UseGuestClientResult {
  const [state, setState] = useState<GuestClientState>(initialState);
  const signalingRef = useRef<SignalingClient | null>(null);
  const peerRef = useRef<GuestPeer | null>(null);

  const send = useCallback((msg: GuestToHostMessage) => {
    peerRef.current?.send(JSON.stringify(msg));
  }, []);

  const onHostMessage = useCallback((raw: string) => {
    let msg: HostToGuestMessage;
    try {
      msg = JSON.parse(raw) as HostToGuestMessage;
    } catch {
      return;
    }
    setState((s) => {
      switch (msg.type) {
        case "ROSTER_UPDATE":
          return { ...s, players: msg.players };
        case "YOUR_ROLE":
          return {
            ...s,
            role: msg.role,
            teammates: msg.teammates ?? [],
          };
        case "PHASE":
          return {
            ...s,
            phase: msg.phase,
            round: msg.round,
            prompt: msg.prompt ?? "",
            pendingAction: null,
            actionResult: null,
          };
        case "PRIVATE_ACTION_REQUEST":
          return {
            ...s,
            pendingAction: {
              phase: msg.phase,
              options: msg.options,
              allowSelf: msg.allowSelf,
            },
          };
        case "PRIVATE_ACTION_RESULT":
          return {
            ...s,
            actionResult: { target: msg.target, isMafia: msg.isMafia },
          };
        case "ANNOUNCEMENT":
          return {
            ...s,
            announcements: [...s.announcements, msg.text].slice(-10),
          };
        case "GAME_OVER":
          return {
            ...s,
            gameOver: { winner: msg.winner, reveal: msg.reveal },
            phase: "game_over",
            pendingAction: null,
          };
      }
    });
  }, []);

  const join = useCallback(
    async (roomCode: string, displayName: string) => {
      setState((s) => ({ ...s, status: "joining", error: null, roomCode }));
      try {
        const { peerId, hostId } = await joinRoom(roomCode, displayName);
        setState((s) => ({
          ...s,
          peerId,
          hostId,
          status: "connecting",
        }));

        let guestInstance: GuestPeer | null = null;

        const signaling = new SignalingClient({
          roomCode,
          peerId,
          onMessage: (m: ServerToClientSignal) => {
            void guestInstance?.handleSignal(m);
          },
          onError: (err) =>
            setState((s) => ({ ...s, error: String(err) })),
        });

        const guest = new GuestPeer({
          signaling,
          peerId,
          hostId,
          onOpen: () => {
            setState((s) => ({ ...s, status: "connected" }));
            peerRef.current?.send(
              JSON.stringify({
                type: "HELLO",
                displayName,
              } satisfies GuestToHostMessage),
            );
          },
          onMessage: onHostMessage,
          onClose: () => {
            setState((s) =>
              s.status === "connected"
                ? { ...s, status: "error", error: "host disconnected" }
                : s,
            );
          },
          onError: (err) =>
            setState((s) => ({ ...s, error: String(err) })),
        });

        guestInstance = guest;
        signalingRef.current = signaling;
        peerRef.current = guest;
        signaling.open();
      } catch (err) {
        setState((s) => ({
          ...s,
          status: "error",
          error: String(err),
        }));
      }
    },
    [onHostMessage],
  );

  const sendAction = useCallback(
    (target: PlayerId) => {
      if (!state.pendingAction) return;
      send({
        type: "ACTION",
        phase: state.pendingAction.phase,
        target,
      });
      setState((s) => ({ ...s, pendingAction: null }));
    },
    [send, state.pendingAction],
  );

  const sendVote = useCallback(
    (target: PlayerId | "skip") => {
      send({ type: "VOTE", target });
      setState((s) => ({ ...s, pendingAction: null }));
    },
    [send],
  );

  const leave = useCallback(() => {
    peerRef.current?.close();
    signalingRef.current?.close();
    peerRef.current = null;
    signalingRef.current = null;
    setState(initialState);
  }, []);

  useEffect(() => {
    return () => {
      peerRef.current?.close();
      signalingRef.current?.close();
    };
  }, []);

  return { ...state, join, sendAction, sendVote, leave };
}
