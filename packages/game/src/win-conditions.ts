import type { GameState, Player } from "./types";

export function aliveMafia(players: Player[]): Player[] {
  return players.filter((p) => p.alive && p.role === "mafia");
}

export function aliveTown(players: Player[]): Player[] {
  return players.filter((p) => p.alive && p.role !== "mafia");
}

export function checkWinner(state: GameState): "mafia" | "town" | null {
  const mafia = aliveMafia(state.players).length;
  const town = aliveTown(state.players).length;
  if (mafia === 0) return "town";
  if (mafia >= town) return "mafia";
  return null;
}
