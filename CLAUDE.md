# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Product Vision

Meado is a 2D spatial social platform. Users move avatars on an interactive top-down map representing real spaces (offices, homes, event venues). Communication is proximity-based: audio and video only activate when two avatars enter a configurable radial distance R. Volume scales continuously with distance — louder when close, silent when far.

**Phase 1 target:** up to 20 simultaneous users across multiple rooms, personal use.  
**Non-negotiable priorities:** HD audio/video without dropouts · sub-100ms avatar sync latency · minimal browser CPU load.

### Scalability Roadmap

Every architectural decision must leave the door open for the following transitions — do not paint into corners:

| Phase | Media model | Position sync | Users |
|---|---|---|---|
| 1 (now) | LiveKit SFU (external) | Socket.io + in-memory Map | ≤ 20 |
| 2 | LiveKit SFU, dynamic room management | Socket.io + Redis pub/sub | ≤ 1 000 |
| 3 | LiveKit SFU cluster / Mesh fallback | WebTransport + Redis cluster | ≥ 10 000 |

The in-memory `Map` in `RoomsService` and the Socket.io transport are both designed to be swapped without touching the Gateway interface. Keep that contract stable.

---

## Project Structure

Monorepo with two independent apps (separate `node_modules`):

- `apps/frontend` — SvelteKit 5 + Vite + Phaser.js (2D map canvas)
- `apps/backend` — NestJS 11 + Socket.io + Prisma 7 (PostgreSQL)

---

## Commands

### Frontend (`apps/frontend`)

```bash
npm run dev          # Vite dev server (localhost:5173)
npm run build        # Production build
npm run check        # svelte-check type check
npm run lint         # prettier --check + eslint
npm run format       # prettier --write
```

### Backend (`apps/backend`)

```bash
npm run start:dev    # Watch mode (localhost:3000)
npm run build        # Compile to dist/
npm run start:prod   # node dist/main
npm run test         # Jest unit (*.spec.ts in src/)
npm run test:e2e     # Jest e2e (test/jest-e2e.json)
```

Run a single test file:
```bash
npx jest src/rooms/rooms.service.spec.ts
```

Prisma commands (run from `apps/backend`):
```bash
npx prisma generate          # Re-generate client after schema changes
npx prisma migrate dev       # Create and apply a new migration
npx prisma studio            # GUI database browser
```

---

## Architecture

### Real-time Communication

Socket.io events are typed end-to-end. The canonical type definitions live in **two mirrored files** that must stay in sync manually until a shared package is created:

- `apps/backend/src/shared/types/socket-events.types.ts`
- `apps/frontend/src/lib/types/socket-events.types.ts`

Events: `room:join` / `player:move` (client→server) and `room:state` / `player:joined` / `player:moved` / `player:left` (server→client).

### Proximity Audio/Video (LiveKit)

LiveKit is the SFU for all media. The proximity logic runs **client-side only**: the Phaser scene calculates distance between local and remote avatars each frame, then calls the LiveKit SDK to adjust participant volume or pause/resume tracks. The backend never processes media — it only relays positions.

Distance model: `volume = clamp(1 - distance / R, 0, 1)` applied to each remote participant's audio track. `R` (proximity radius) is a per-room constant, configurable server-side and sent in `room:state`.

### Backend Modules

```
src/
  prisma/       PrismaModule (global) — PrismaService extends PrismaClient
  rooms/        RoomsModule — Gateway (WebSocket) + Service (in-memory player state)
  shared/types/ Shared Socket.io interfaces
```

`RoomsService` stores player positions in a `Map<socketId, PlayerState>`. Redis will replace this for Phase 2 without changing the Gateway or the event contracts.

`RoomsGateway` handles `connection`/`disconnect` lifecycle and the two `@SubscribeMessage` handlers. CORS origin comes from `process.env.CORS_ORIGIN` (comma-separated list).

### Frontend Architecture

```
src/lib/
  socket.ts           Svelte store wrapping socket.io-client (connect/disconnect/players)
  types/              Mirrored socket event types
  game/
    GameScene.ts      Phaser scene factory — createGameScene(Phaser, socket, config)
    PhaserGame.svelte Phaser host component (dynamic imports Phaser + GameScene in onMount)
src/routes/
  +layout.svelte      Minimal layout (global CSS reset only)
  +page.svelte        Game page — mounts PhaserGame, shows connection HUD
```

**Phaser is always dynamically imported** inside `onMount` to avoid SSR failures. `GameScene.ts` uses a factory function (`createGameScene`) so the class is defined at module scope, not inside a callback (Svelte lint requirement).

**Interpolation**: remote players lerp toward their last known position each frame via `alpha = 1 - lerpStiffness^dt` (exponential decay). This decouples visual smoothness from the 20 Hz emit rate and tolerates packet jitter without rubber-banding.

**CPU efficiency note**: position emission is throttled to 20 Hz with a timestamp check inside Phaser's `update()` loop. Do not use `setInterval` for this — it runs outside the game loop and causes drift. Future upgrade: batch multiple position updates into a single binary frame (MessagePack or a flat ArrayBuffer) to reduce per-message overhead at scale.

### Prisma (v7)

Prisma 7 stores the datasource URL in `prisma.config.ts`, not in `schema.prisma`. The generated client outputs to `apps/backend/generated/prisma/` and is imported as:
```typescript
import { PrismaClient } from '../../generated/prisma/client.js';
```
The `.js` extension is required by the `nodenext` module resolver even though the source is TypeScript.

### Environment Variables

Backend (`apps/backend/.env`):
```
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/meado?schema=public"
CORS_ORIGIN="http://localhost:5173"
PORT=3000
```

Frontend (`apps/frontend/.env`):
```
VITE_BACKEND_URL=http://localhost:3000
```
