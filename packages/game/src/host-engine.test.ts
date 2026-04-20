import { describe, expect, it } from "vitest";
import {
  createInitialState,
  detectiveResult,
  isDayVoteComplete,
  isNightComplete,
  reduce,
} from "./host-engine";
import { assignRoles, defaultRoleCounts } from "./role-assign";
import { checkWinner } from "./win-conditions";
import type { Player } from "./types";

function seedFive() {
  let s = createInitialState("host", "seed-test");
  for (const name of ["host", "b", "c", "d", "e"]) {
    s = reduce(s, { type: "PLAYER_JOINED", id: name, displayName: name });
  }
  return s;
}

describe("role assignment", () => {
  it("is deterministic given the same seed", () => {
    const players: Player[] = ["a", "b", "c", "d"].map((id) => ({
      id,
      displayName: id,
      alive: true,
      connected: true,
    }));
    const counts = defaultRoleCounts(4);
    const a = assignRoles(players, counts, "abc");
    const b = assignRoles(players, counts, "abc");
    expect(a.map((p) => p.role)).toEqual(b.map((p) => p.role));
  });

  it("produces different role orders for different seeds", () => {
    const players: Player[] = Array.from({ length: 8 }, (_, i) => ({
      id: String(i),
      displayName: String(i),
      alive: true,
      connected: true,
    }));
    const counts = defaultRoleCounts(8);
    const a = assignRoles(players, counts, "seed-1");
    const b = assignRoles(players, counts, "seed-2");
    expect(a.map((p) => p.role)).not.toEqual(b.map((p) => p.role));
  });
});

describe("lobby transitions", () => {
  it("requires at least 4 players to start", () => {
    let s = createInitialState("host", "x");
    s = reduce(s, { type: "PLAYER_JOINED", id: "host", displayName: "h" });
    s = reduce(s, { type: "PLAYER_JOINED", id: "b", displayName: "b" });
    s = reduce(s, { type: "START_GAME" });
    expect(s.phase).toBe("lobby");
  });

  it("starts on 4 players and moves to night", () => {
    let s = createInitialState("host", "x");
    for (const n of ["host", "b", "c", "d"]) {
      s = reduce(s, { type: "PLAYER_JOINED", id: n, displayName: n });
    }
    s = reduce(s, { type: "START_GAME" });
    expect(s.phase).toBe("night");
    expect(s.round).toBe(1);
    expect(s.players.every((p) => p.role)).toBe(true);
  });
});

describe("night resolution", () => {
  it("kills target when doctor does not save", () => {
    let s = seedFive();
    s = reduce(s, { type: "START_GAME" });
    const mafia = s.players.find((p) => p.role === "mafia")!;
    const victim = s.players.find(
      (p) => p.role !== "mafia" && p.role !== "doctor",
    )!;
    const detective = s.players.find((p) => p.role === "detective")!;
    const doctor = s.players.find((p) => p.role === "doctor");
    s = reduce(s, { type: "MAFIA_VOTE", by: mafia.id, target: victim.id });
    s = reduce(s, {
      type: "DETECTIVE_PICK",
      by: detective.id,
      target: mafia.id,
    });
    if (doctor) {
      s = reduce(s, {
        type: "DOCTOR_PICK",
        by: doctor.id,
        target: detective.id,
      });
    }
    expect(isNightComplete(s)).toBe(true);
    s = reduce(s, { type: "RESOLVE_NIGHT" });
    expect(s.lastNightVictim).toBe(victim.id);
    expect(s.players.find((p) => p.id === victim.id)!.alive).toBe(false);
  });

  it("announces 'saved' when doctor guards the mafia's target", () => {
    let s = seedFive();
    s = reduce(s, { type: "START_GAME" });
    const mafia = s.players.find((p) => p.role === "mafia")!;
    const doctor = s.players.find((p) => p.role === "doctor");
    if (!doctor) return;
    const victim = s.players.find(
      (p) => p.role !== "mafia" && p.id !== doctor.id,
    )!;
    const detective = s.players.find((p) => p.role === "detective")!;
    s = reduce(s, { type: "MAFIA_VOTE", by: mafia.id, target: victim.id });
    s = reduce(s, { type: "DOCTOR_PICK", by: doctor.id, target: victim.id });
    s = reduce(s, {
      type: "DETECTIVE_PICK",
      by: detective.id,
      target: mafia.id,
    });
    s = reduce(s, { type: "RESOLVE_NIGHT" });
    expect(s.lastNightVictim).toBe("saved");
    expect(s.players.find((p) => p.id === victim.id)!.alive).toBe(true);
  });
});

describe("detective investigation", () => {
  it("returns isMafia=true when probing mafia", () => {
    let s = seedFive();
    s = reduce(s, { type: "START_GAME" });
    const mafia = s.players.find((p) => p.role === "mafia")!;
    expect(detectiveResult(s, mafia.id)).toEqual({
      target: mafia.id,
      isMafia: true,
    });
  });

  it("returns isMafia=false when probing town", () => {
    let s = seedFive();
    s = reduce(s, { type: "START_GAME" });
    const town = s.players.find((p) => p.role !== "mafia")!;
    expect(detectiveResult(s, town.id)).toEqual({
      target: town.id,
      isMafia: false,
    });
  });
});

describe("day vote", () => {
  it("ties cause no elimination", () => {
    let s = seedFive();
    s = reduce(s, { type: "START_GAME" });
    // fake advance to day_vote
    s = { ...s, phase: "day_vote", day: { votes: {} } };
    const ids = s.players.map((p) => p.id);
    s = reduce(s, { type: "DAY_VOTE", by: ids[0]!, target: ids[1]! });
    s = reduce(s, { type: "DAY_VOTE", by: ids[1]!, target: ids[0]! });
    s = reduce(s, { type: "DAY_VOTE", by: ids[2]!, target: ids[3]! });
    s = reduce(s, { type: "DAY_VOTE", by: ids[3]!, target: ids[2]! });
    s = reduce(s, { type: "DAY_VOTE", by: ids[4]!, target: "skip" });
    expect(isDayVoteComplete(s)).toBe(true);
    s = reduce(s, { type: "RESOLVE_DAY" });
    expect(s.lastDayEliminated).toBeUndefined();
    expect(s.players.every((p) => p.alive)).toBe(true);
  });

  it("eliminates majority target", () => {
    let s = seedFive();
    s = reduce(s, { type: "START_GAME" });
    s = { ...s, phase: "day_vote", day: { votes: {} } };
    const ids = s.players.map((p) => p.id);
    const target = ids[0]!;
    for (const id of ids) {
      s = reduce(s, { type: "DAY_VOTE", by: id, target });
    }
    s = reduce(s, { type: "RESOLVE_DAY" });
    expect(s.lastDayEliminated).toBe(target);
    expect(s.players.find((p) => p.id === target)!.alive).toBe(false);
  });
});

describe("win conditions", () => {
  it("town wins when all mafia are dead", () => {
    const players: Player[] = [
      { id: "a", displayName: "a", alive: false, connected: true, role: "mafia" },
      { id: "b", displayName: "b", alive: true, connected: true, role: "villager" },
      { id: "c", displayName: "c", alive: true, connected: true, role: "doctor" },
    ];
    const winner = checkWinner({
      phase: "day_resolve",
      players,
      hostId: "a",
      round: 2,
      seed: "s",
      roleCounts: { mafia: 1, detective: 0, doctor: 1, villager: 1 },
      night: {
        mafiaVotes: {},
        doctorSelfSaveUsed: false,
      },
      day: { votes: {} },
    });
    expect(winner).toBe("town");
  });

  it("mafia wins when mafia count >= town count", () => {
    const players: Player[] = [
      { id: "a", displayName: "a", alive: true, connected: true, role: "mafia" },
      { id: "b", displayName: "b", alive: true, connected: true, role: "villager" },
    ];
    const winner = checkWinner({
      phase: "day_resolve",
      players,
      hostId: "a",
      round: 2,
      seed: "s",
      roleCounts: { mafia: 1, detective: 0, doctor: 0, villager: 1 },
      night: { mafiaVotes: {}, doctorSelfSaveUsed: false },
      day: { votes: {} },
    });
    expect(winner).toBe("mafia");
  });
});

describe("doctor self-save", () => {
  it("allows self-save only once per game", () => {
    let s = seedFive();
    s = reduce(s, { type: "START_GAME" });
    const doctor = s.players.find((p) => p.role === "doctor");
    if (!doctor) return;
    s = reduce(s, {
      type: "DOCTOR_PICK",
      by: doctor.id,
      target: doctor.id,
    });
    expect(s.night.doctorSelfSaveUsed).toBe(true);
    expect(s.night.doctorTarget).toBe(doctor.id);
    // simulate next round: clear night
    s = {
      ...s,
      night: { ...s.night, doctorTarget: undefined },
    };
    const before = s.night.doctorTarget;
    s = reduce(s, {
      type: "DOCTOR_PICK",
      by: doctor.id,
      target: doctor.id,
    });
    expect(s.night.doctorTarget).toBe(before);
  });
});
