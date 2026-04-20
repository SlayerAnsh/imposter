export type PlayerId = string;

export type Role = "mafia" | "villager" | "detective" | "doctor";

export type Phase =
  | "lobby"
  | "assigning"
  | "night"
  | "night_resolve"
  | "day_announce"
  | "day_vote"
  | "day_resolve"
  | "game_over";

export interface Player {
  id: PlayerId;
  displayName: string;
  alive: boolean;
  role?: Role;
  connected: boolean;
}

export interface RoleCounts {
  mafia: number;
  detective: number;
  doctor: number;
  villager: number;
}

export interface NightActions {
  mafiaVotes: Record<PlayerId, PlayerId>;
  detectiveTarget?: PlayerId;
  doctorTarget?: PlayerId;
  doctorSelfSaveUsed: boolean;
}

export interface DayVotes {
  votes: Record<PlayerId, PlayerId | "skip">;
}

export interface GameState {
  phase: Phase;
  players: Player[];
  hostId: PlayerId;
  round: number;
  seed: string;
  roleCounts: RoleCounts;
  night: NightActions;
  day: DayVotes;
  lastNightVictim?: PlayerId | "saved" | "none";
  lastDayEliminated?: PlayerId;
  winner?: "mafia" | "town";
}

export type HostToGuestMessage =
  | { type: "ROSTER_UPDATE"; players: PublicPlayer[] }
  | { type: "YOUR_ROLE"; role: Role; teammates?: PlayerId[] }
  | {
      type: "PHASE";
      phase: Phase;
      round: number;
      endsAt?: number;
      prompt?: string;
    }
  | {
      type: "PRIVATE_ACTION_REQUEST";
      phase: Phase;
      options: PlayerId[];
      allowSelf?: boolean;
    }
  | {
      type: "PRIVATE_ACTION_RESULT";
      phase: Phase;
      target: PlayerId;
      isMafia?: boolean;
    }
  | { type: "ANNOUNCEMENT"; text: string }
  | {
      type: "GAME_OVER";
      winner: "mafia" | "town";
      reveal: { id: PlayerId; role: Role }[];
    };

export type GuestToHostMessage =
  | { type: "HELLO"; displayName: string }
  | { type: "ACTION"; phase: Phase; target?: PlayerId }
  | { type: "VOTE"; target: PlayerId | "skip" }
  | { type: "HEARTBEAT" };

export interface PublicPlayer {
  id: PlayerId;
  displayName: string;
  alive: boolean;
  connected: boolean;
}

export function toPublicPlayer(p: Player): PublicPlayer {
  return {
    id: p.id,
    displayName: p.displayName,
    alive: p.alive,
    connected: p.connected,
  };
}
