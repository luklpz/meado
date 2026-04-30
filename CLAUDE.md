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

Prisma commands (run from `apps/backend`):
```bash
npx prisma generate          # Re-generate client after schema changes
npx prisma migrate dev       # Create and apply a new migration
npx prisma studio            # GUI database browser
```

---

## Architecture

### Authentication

JWT-based auth with httpOnly cookies. No passport — uses `jsonwebtoken` + `bcrypt` + `cookie-parser` directly.

- `POST /auth/register` → creates unverified account, sends verification email via Resend, returns `{ message }` — **no auto-login**
- `GET /auth/verify-email?token=xxx` → verifies JWT token, sets `emailVerified: true`, redirects to `/login?verified=1`
- `POST /auth/login` → validates password + checks `emailVerified` (401 if not verified) → sets httpOnly cookie (`token`, 7d)
- `GET /auth/me` → return `{ id, username, role, socketToken }` where `socketToken` is a 1h JWT for Socket.io auth
- `POST /auth/logout` → clear cookie
- `JwtAuthGuard` reads the cookie and attaches `req.user = { id, username, role }`
- `RolesGuard` + `@Roles('ADMIN')` decorator for admin-only endpoints
- **First registered user is automatically ADMIN.** Subsequent users are `USER`.

### Email (Resend)

`EmailModule` + `EmailService` in `src/email/`. Uses the `resend` npm package.  
Verification link format: `${FRONTEND_URL}/api/auth/verify-email?token=xxx` — goes through the Vite proxy (dev) or Vercel rewrite (prod) to hit the backend, which then redirects to the frontend login page.  
If email delivery fails, the user record is deleted (no orphan unverified accounts).

### User Roles

`UserRole` enum: `ADMIN | USER`.  
Admins can: create rooms, modify rooms, delete rooms, manage whitelists.  
Users can: list rooms, join rooms, play.

### Room Access Control

`RoomAccess` enum: `PUBLIC | PASSWORD | WHITELIST`.  
- `PUBLIC`: any logged-in user can join directly.  
- `PASSWORD`: requires `POST /rooms/:slug/join` with `{ password }` — verified with bcrypt.  
- `WHITELIST`: admin adds users via `POST /rooms/:slug/whitelist { username }`. Access denied if not listed.

### Real-time Communication

Socket.io events are typed end-to-end. The canonical type definitions live in **two mirrored files** that must stay in sync manually:

- `apps/backend/src/shared/types/socket-events.types.ts`
- `apps/frontend/src/lib/types/socket-events.types.ts`

Events: `room:join` / `player:move` (client→server) and `room:state` / `player:joined` / `player:moved` / `player:left` (server→client).

**Socket auth**: the gateway verifies `client.handshake.auth.token` (the `socketToken` from `GET /auth/me`) on every connection. Invalid token → disconnect. The username in `room:join` payload is **overridden** by the authenticated username from the JWT — clients cannot spoof others' identities.

### Proximity Audio/Video (LiveKit)

LiveKit is the SFU for all media. The proximity logic runs **client-side only**: the Phaser scene calculates distance between local and remote avatars each frame, then calls the LiveKit SDK to adjust participant volume or pause/resume tracks. The backend never processes media — it only relays positions.

Distance model: `volume = clamp(1 - distance / R, 0, 1)` applied to each remote participant's audio track. `R` (proximity radius) is a per-room constant stored in DB, configurable per room.

**Critical LiveKit setup** (hard-won, do not change):
- `adaptiveStream: false` — prevents tracks from pausing on hidden elements.
- Remote tracks must be manually attached: `track.attach()` in `TrackSubscribed` event, element appended to `document.body` with `display: none`.
- Mic pipeline: `getUserMedia → AudioContext → GainNode → AnalyserNode → MediaStreamDestinationNode → publishTrack`.

### Backend Modules

```
src/
  prisma/       PrismaModule (global) — PrismaService extends PrismaClient
  auth/         AuthModule — AuthService, AuthController, JwtAuthGuard, RolesGuard
  rooms/        RoomsModule — Gateway (WebSocket) + Service (in-memory + DB) + Controller
  shared/types/ Shared Socket.io interfaces
```

`RoomsService` stores player positions in a `Map<socketId, PlayerState>` (real-time) alongside DB operations (persistent rooms). Redis will replace the Map for Phase 2 without changing the Gateway or event contracts.

### Frontend Architecture

```
src/lib/
  auth.ts             Auth store (login/register/logout/init/getSocketToken)
  socket.ts           Svelte store wrapping socket.io-client
  livekit.ts          Svelte store wrapping LiveKit client
  types/              Mirrored socket event types
  game/
    GameScene.ts      Phaser scene factory — createGameScene(Phaser, socket, config)
    PhaserGame.svelte Phaser host component — receives roomSlug + username as props
src/routes/
  +layout.svelte          Minimal layout (CSS reset)
  +layout.server.ts       Passes locals.user to all pages
  +page.ts                Redirect → /rooms (authed) or /login
  login/+page.svelte      Login form
  register/+page.svelte   Register form (first user = admin)
  rooms/
    +page.server.ts       Guard (redirect /login if not authed) + load rooms from DB
    +page.svelte          Rooms lobby — list, join, create (admin only)
    [slug]/
      +page.server.ts     Guard + pass user/slug to page
      +page.svelte        Game page — HUD + PhaserGame
src/hooks.server.ts       Reads token cookie → calls GET /auth/me → sets locals.user
```

**Phaser is always dynamically imported** inside `onMount` to avoid SSR failures. `GameScene.ts` uses a factory function (`createGameScene`) so the class is defined at module scope.

**Interpolation**: remote players lerp toward their last known position each frame via `alpha = 1 - lerpStiffness^dt` (exponential decay). This decouples visual smoothness from the 20 Hz emit rate.

**CPU efficiency note**: position emission is throttled to 20 Hz with a timestamp check inside Phaser's `update()` loop. Do not use `setInterval` for this.

### API URL Strategy

All HTTP API calls use the relative path `/api/...` — never the direct backend URL.

- **Dev**: Vite proxy in `vite.config.ts` rewrites `/api` → `http://localhost:3000` and `/socket.io` → `http://localhost:3000` (WebSocket).
- **Prod**: `vercel.json` rewrites `/api/:path*` → `https://meado-backend.onrender.com/:path*`.

Socket.io connects to `VITE_SOCKET_URL` (empty in dev → same origin, proxied; full URL in prod).

### Prisma (v7)

Prisma 7 stores the datasource URL in `prisma.config.ts`, not in `schema.prisma`. The generated client outputs to `apps/backend/generated/prisma/` and is imported as:
```typescript
import { PrismaClient } from '../../generated/prisma/client.js';
```
The `.js` extension is required by the `nodenext` module resolver even though the source is TypeScript.

### Environment Variables

Backend (`apps/backend/.env`):
```
DATABASE_URL="postgresql://..."    # Supabase Session Pooler (port 5432)
CORS_ORIGIN="http://localhost:5173"
PORT=3000
JWT_SECRET="dev-secret-change-in-production"
LIVEKIT_URL=wss://...
LIVEKIT_API_KEY=...
LIVEKIT_API_SECRET=...
RESEND_API_KEY=re_...
RESEND_FROM=noreply@meado.es
FRONTEND_URL=http://localhost:5173   # used in verification email link + redirects
```

Frontend (`apps/frontend/.env`):
```
VITE_SOCKET_URL=              # empty in dev (proxy), full URL in prod
VITE_LIVEKIT_URL=wss://...
BACKEND_URL=http://localhost:3000   # private, server-side only (hooks.server.ts)
```

Render env vars (production backend):
```
JWT_SECRET=<strong-secret>
CORS_ORIGIN=https://meado.es,https://www.meado.es
NODE_ENV=production
RESEND_API_KEY=re_...
RESEND_FROM=noreply@meado.es
FRONTEND_URL=https://meado.es
```

Vercel env vars (production frontend):
```
VITE_SOCKET_URL=https://meado-backend.onrender.com
BACKEND_URL=https://meado-backend.onrender.com
```
