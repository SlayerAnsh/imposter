# imposter

A browser-based Mafia party game. Join a room by code, get dealt a role
(Mafia / Villager / Detective / Doctor), and let the app run the night-and-day
cycle for you.

## How it works

- **Room creation + join flow**: a tiny Next.js signaling service (SSE +
  HTTP POST) helps peers find each other by room code.
- **Gameplay**: runs entirely peer-to-peer over **WebRTC data channels**
  between the host device and each guest. The server never sees role
  assignments, votes, or any game content.
- **No database**: the host tab holds the authoritative game state; the
  signaling server only holds an in-memory map of live rooms.

See `/root/.claude/plans/design-spec-for-imposter-binary-muffin.md` for the
full design.

## Monorepo layout

```
apps/
  web/               Next.js 15 App Router app (UI + /api/rooms signaling)
packages/
  game/              Pure game engine (reducer, role assignment, win checks)
  net/               WebRTC + signaling-client helpers
  ui/                Small shared React primitives
```

## Getting started

```sh
pnpm install
pnpm dev               # starts apps/web on http://localhost:3000
pnpm --filter @imposter/game test
pnpm typecheck
pnpm build
```

Deploy `apps/web` to any long-lived Node host (Fly, Render, Railway, a VPS).
Serverless platforms that recycle instances mid-game will break the
in-memory room registry.
