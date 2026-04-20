import { assignRoles, defaultRoleCounts } from "./role-assign";
import type {
  GameState,
  NightActions,
  Phase,
  Player,
  PlayerId,
  Role,
  RoleCounts,
} from "./types";
import { checkWinner } from "./win-conditions";

export function createInitialState(
  hostId: PlayerId,
  seed: string,
): GameState {
  return {
    phase: "lobby",
    players: [],
    hostId,
    round: 0,
    seed,
    roleCounts: { mafia: 1, detective: 1, doctor: 0, villager: 2 },
    night: emptyNight(),
    day: { votes: {} },
  };
}

function emptyNight(): NightActions {
  return {
    mafiaVotes: {},
    detectiveTarget: undefined,
    doctorTarget: undefined,
    doctorSelfSaveUsed: false,
  };
}

export type Event =
  | { type: "PLAYER_JOINED"; id: PlayerId; displayName: string }
  | { type: "PLAYER_LEFT"; id: PlayerId }
  | { type: "PLAYER_DISCONNECTED"; id: PlayerId }
  | { type: "PLAYER_RECONNECTED"; id: PlayerId }
  | { type: "SET_ROLE_COUNTS"; counts: RoleCounts }
  | { type: "START_GAME" }
  | { type: "MAFIA_VOTE"; by: PlayerId; target: PlayerId }
  | { type: "DETECTIVE_PICK"; by: PlayerId; target: PlayerId }
  | { type: "DOCTOR_PICK"; by: PlayerId; target: PlayerId }
  | { type: "RESOLVE_NIGHT" }
  | { type: "ADVANCE_TO_VOTE" }
  | { type: "DAY_VOTE"; by: PlayerId; target: PlayerId | "skip" }
  | { type: "RESOLVE_DAY" }
  | { type: "NEXT_ROUND" }
  | { type: "RESET_TO_LOBBY" };

export function reduce(state: GameState, event: Event): GameState {
  switch (event.type) {
    case "PLAYER_JOINED": {
      if (state.phase !== "lobby") return state;
      if (state.players.some((p) => p.id === event.id)) return state;
      const next = {
        ...state,
        players: [
          ...state.players,
          {
            id: event.id,
            displayName: event.displayName,
            alive: true,
            connected: true,
          } satisfies Player,
        ],
      };
      return {
        ...next,
        roleCounts: defaultRoleCounts(next.players.length),
      };
    }
    case "PLAYER_LEFT": {
      if (state.phase === "lobby") {
        const players = state.players.filter((p) => p.id !== event.id);
        return {
          ...state,
          players,
          roleCounts: defaultRoleCounts(players.length),
        };
      }
      return {
        ...state,
        players: state.players.map((p) =>
          p.id === event.id ? { ...p, alive: false, connected: false } : p,
        ),
      };
    }
    case "PLAYER_DISCONNECTED": {
      return {
        ...state,
        players: state.players.map((p) =>
          p.id === event.id ? { ...p, connected: false } : p,
        ),
      };
    }
    case "PLAYER_RECONNECTED": {
      return {
        ...state,
        players: state.players.map((p) =>
          p.id === event.id ? { ...p, connected: true } : p,
        ),
      };
    }
    case "SET_ROLE_COUNTS": {
      if (state.phase !== "lobby") return state;
      return { ...state, roleCounts: event.counts };
    }
    case "START_GAME": {
      if (state.phase !== "lobby") return state;
      if (state.players.length < 4) return state;
      const players = assignRoles(
        state.players,
        state.roleCounts,
        state.seed,
      );
      return {
        ...state,
        phase: "night",
        round: 1,
        players,
        night: emptyNight(),
        day: { votes: {} },
        lastNightVictim: undefined,
        lastDayEliminated: undefined,
      };
    }
    case "MAFIA_VOTE": {
      if (state.phase !== "night") return state;
      const voter = findAlive(state.players, event.by);
      const target = findAlive(state.players, event.target);
      if (!voter || voter.role !== "mafia" || !target) return state;
      return {
        ...state,
        night: {
          ...state.night,
          mafiaVotes: { ...state.night.mafiaVotes, [event.by]: event.target },
        },
      };
    }
    case "DETECTIVE_PICK": {
      if (state.phase !== "night") return state;
      const voter = findAlive(state.players, event.by);
      const target = findAlive(state.players, event.target);
      if (!voter || voter.role !== "detective" || !target) return state;
      if (target.id === voter.id) return state;
      return {
        ...state,
        night: { ...state.night, detectiveTarget: event.target },
      };
    }
    case "DOCTOR_PICK": {
      if (state.phase !== "night") return state;
      const voter = findAlive(state.players, event.by);
      const target = findAlive(state.players, event.target);
      if (!voter || voter.role !== "doctor" || !target) return state;
      if (target.id === voter.id && state.night.doctorSelfSaveUsed)
        return state;
      const selfSave = target.id === voter.id;
      return {
        ...state,
        night: {
          ...state.night,
          doctorTarget: event.target,
          doctorSelfSaveUsed:
            state.night.doctorSelfSaveUsed || selfSave,
        },
      };
    }
    case "RESOLVE_NIGHT": {
      if (state.phase !== "night") return state;
      const victim = resolveMafiaVote(state);
      let players = state.players;
      let lastNightVictim: GameState["lastNightVictim"] = "none";
      if (victim) {
        if (state.night.doctorTarget === victim) {
          lastNightVictim = "saved";
        } else {
          lastNightVictim = victim;
          players = state.players.map((p) =>
            p.id === victim ? { ...p, alive: false } : p,
          );
        }
      }
      const interim: GameState = {
        ...state,
        players,
        lastNightVictim,
        phase: "day_announce",
      };
      const winner = checkWinner(interim);
      if (winner) return { ...interim, phase: "game_over", winner };
      return interim;
    }
    case "ADVANCE_TO_VOTE": {
      if (state.phase !== "day_announce") return state;
      return { ...state, phase: "day_vote", day: { votes: {} } };
    }
    case "DAY_VOTE": {
      if (state.phase !== "day_vote") return state;
      const voter = findAlive(state.players, event.by);
      if (!voter) return state;
      if (event.target !== "skip") {
        const target = findAlive(state.players, event.target);
        if (!target) return state;
      }
      return {
        ...state,
        day: { votes: { ...state.day.votes, [event.by]: event.target } },
      };
    }
    case "RESOLVE_DAY": {
      if (state.phase !== "day_vote") return state;
      const eliminated = tallyDayVotes(state);
      let players = state.players;
      if (eliminated && eliminated !== "skip") {
        players = state.players.map((p) =>
          p.id === eliminated ? { ...p, alive: false } : p,
        );
      }
      const interim: GameState = {
        ...state,
        players,
        lastDayEliminated:
          eliminated && eliminated !== "skip" ? eliminated : undefined,
        phase: "day_resolve",
      };
      const winner = checkWinner(interim);
      if (winner) return { ...interim, phase: "game_over", winner };
      return interim;
    }
    case "NEXT_ROUND": {
      if (state.phase !== "day_resolve") return state;
      return {
        ...state,
        phase: "night",
        round: state.round + 1,
        night: emptyNight(),
        day: { votes: {} },
        lastNightVictim: undefined,
        lastDayEliminated: undefined,
      };
    }
    case "RESET_TO_LOBBY": {
      return {
        ...state,
        phase: "lobby",
        round: 0,
        players: state.players.map((p) => ({
          ...p,
          alive: true,
          role: undefined,
        })),
        night: emptyNight(),
        day: { votes: {} },
        lastNightVictim: undefined,
        lastDayEliminated: undefined,
        winner: undefined,
      };
    }
    default:
      return state;
  }
}

function findAlive(players: Player[], id: PlayerId): Player | undefined {
  return players.find((p) => p.id === id && p.alive);
}

function resolveMafiaVote(state: GameState): PlayerId | undefined {
  const counts: Record<PlayerId, number> = {};
  for (const target of Object.values(state.night.mafiaVotes)) {
    counts[target] = (counts[target] ?? 0) + 1;
  }
  let winner: PlayerId | undefined;
  let winnerCount = 0;
  const sortedIds = Object.keys(counts).sort();
  for (const id of sortedIds) {
    const c = counts[id] ?? 0;
    if (c > winnerCount) {
      winner = id;
      winnerCount = c;
    }
  }
  return winner;
}

function tallyDayVotes(state: GameState): PlayerId | "skip" | undefined {
  const counts: Record<string, number> = {};
  for (const v of Object.values(state.day.votes)) {
    counts[v] = (counts[v] ?? 0) + 1;
  }
  let top: string | undefined;
  let topCount = 0;
  let tied = false;
  for (const [id, c] of Object.entries(counts)) {
    if (c > topCount) {
      top = id;
      topCount = c;
      tied = false;
    } else if (c === topCount) {
      tied = true;
    }
  }
  if (!top || tied) return undefined;
  return top as PlayerId | "skip";
}

export function isNightComplete(state: GameState): boolean {
  if (state.phase !== "night") return false;
  const alive = state.players.filter((p) => p.alive);
  const aliveMafia = alive.filter((p) => p.role === "mafia");
  const aliveDetective = alive.find((p) => p.role === "detective");
  const aliveDoctor = alive.find((p) => p.role === "doctor");
  const allMafiaVoted = aliveMafia.every(
    (m) => state.night.mafiaVotes[m.id] !== undefined,
  );
  const detectiveDone =
    !aliveDetective || state.night.detectiveTarget !== undefined;
  const doctorDone = !aliveDoctor || state.night.doctorTarget !== undefined;
  return allMafiaVoted && detectiveDone && doctorDone;
}

export function isDayVoteComplete(state: GameState): boolean {
  if (state.phase !== "day_vote") return false;
  const alive = state.players.filter((p) => p.alive);
  return alive.every((p) => state.day.votes[p.id] !== undefined);
}

export function detectiveResult(
  state: GameState,
  target: PlayerId,
): { target: PlayerId; isMafia: boolean } | null {
  const t = state.players.find((p) => p.id === target);
  if (!t || !t.role) return null;
  return { target, isMafia: t.role === "mafia" };
}

export function phasePrompt(phase: Phase, role?: Role): string {
  if (phase === "night") {
    switch (role) {
      case "mafia":
        return "Choose someone to eliminate.";
      case "detective":
        return "Choose someone to investigate.";
      case "doctor":
        return "Choose someone to save.";
      default:
        return "You are asleep. Wait for morning.";
    }
  }
  if (phase === "day_vote") return "Vote for who to eliminate.";
  if (phase === "day_announce") return "Morning breaks.";
  return "";
}
