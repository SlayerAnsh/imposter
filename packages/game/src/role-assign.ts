import type { Player, Role, RoleCounts } from "./types";

function hashSeed(seed: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h;
}

function mulberry32(a: number): () => number {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function seededShuffle<T>(items: T[], seed: string): T[] {
  const rng = mulberry32(hashSeed(seed));
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = out[i] as T;
    out[i] = out[j] as T;
    out[j] = tmp;
  }
  return out;
}

export function defaultRoleCounts(playerCount: number): RoleCounts {
  if (playerCount <= 4) {
    return { mafia: 1, detective: 1, doctor: 0, villager: playerCount - 2 };
  }
  if (playerCount <= 6) {
    return { mafia: 1, detective: 1, doctor: 1, villager: playerCount - 3 };
  }
  if (playerCount <= 9) {
    return { mafia: 2, detective: 1, doctor: 1, villager: playerCount - 4 };
  }
  return { mafia: 3, detective: 1, doctor: 1, villager: playerCount - 5 };
}

export function validateRoleCounts(
  counts: RoleCounts,
  playerCount: number,
): string | null {
  const total =
    counts.mafia + counts.detective + counts.doctor + counts.villager;
  if (total !== playerCount) {
    return `Roles sum to ${total} but there are ${playerCount} players.`;
  }
  if (counts.mafia < 1) return "At least 1 mafia required.";
  if (counts.mafia >= playerCount - counts.mafia) {
    return "Mafia must be fewer than town.";
  }
  return null;
}

export function assignRoles(
  players: Player[],
  counts: RoleCounts,
  seed: string,
): Player[] {
  const roles: Role[] = [
    ...Array<Role>(counts.mafia).fill("mafia"),
    ...Array<Role>(counts.detective).fill("detective"),
    ...Array<Role>(counts.doctor).fill("doctor"),
    ...Array<Role>(counts.villager).fill("villager"),
  ];
  const shuffled = seededShuffle(roles, seed);
  return players.map((p, i) => ({ ...p, role: shuffled[i] as Role }));
}
