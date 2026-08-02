# Meado — Documentación del Proyecto

---

## Índice

1. [¿Qué es Meado?](#1-qué-es-meado)
2. [Concepto y diferencial](#2-concepto-y-diferencial)
3. [Objetivos y fases de crecimiento](#3-objetivos-y-fases-de-crecimiento)
4. [Stack tecnológico](#4-stack-tecnológico)
5. [Arquitectura del sistema](#5-arquitectura-del-sistema)
6. [Estructura del repositorio](#6-estructura-del-repositorio)
7. [Base de datos](#7-base-de-datos)
8. [Autenticación y perfiles](#8-autenticación-y-perfiles)
9. [Servidores y canales](#9-servidores-y-canales)
10. [Amigos y mensajes directos](#10-amigos-y-mensajes-directos)
11. [Comunicación en tiempo real](#11-comunicación-en-tiempo-real)
12. [Audio y vídeo — LiveKit](#12-audio-y-vídeo--livekit)
13. [Subida de archivos](#13-subida-de-archivos)
14. [Motor gráfico — Phaser (modo Spatial, inactivo)](#14-motor-gráfico--phaser-modo-spatial-inactivo)
15. [Entorno de desarrollo](#15-entorno-de-desarrollo)
16. [Infraestructura y despliegue](#16-infraestructura-y-despliegue)
17. [Variables de entorno](#17-variables-de-entorno)
18. [Convenciones y decisiones de diseño](#18-convenciones-y-decisiones-de-diseño)

---

## 1. ¿Qué es Meado?

Meado es una **plataforma social de comunicación híbrida**. Combina lo mejor de las herramientas tipo Discord (servidores, canales de texto y voz, mensajes directos, lista de amigos) con un modo espacial 2D opcional donde los avatares se mueven por un mapa y la comunicación es por proximidad.

El tipo de servidor (`DISCORD` o `SPATIAL`) sigue existiendo como opción al crear un servidor, pero **el modo Spatial está inactivo en el frontend actual** — ver sección 14. La experiencia real hoy es texto + voz estilo Discord sobre toda la base de auth, amigos y mensajería.

---

## 2. Concepto y diferencial

La mayoría de las herramientas de comunicación digital son planas: todos escuchan a todos o nadie escucha a nadie. El modo **Spatial** de Meado propone un modelo distinto: **la comunicación ocurre de forma orgánica según la posición**.

Esto replica dinámicas del mundo físico:
- Conversaciones espontáneas al cruzarte con alguien.
- Grupos que se forman y disuelven de forma natural.
- La posibilidad de estar presente sin estar obligado a participar.

La fórmula de volumen diseñada para servidores espaciales:

```
volumen = clamp(1 − distancia / R, 0, 1)
```

A distancia 0 el volumen es máximo. Al alcanzar el radio R el volumen es 0. La lógica correría completamente en el cliente — el backend nunca procesaría medios. **Esta fórmula está implementada en el código pero no conectada a ningún flujo activo** (ver sección 14) — se documenta aquí como diseño previsto, no como funcionalidad disponible hoy.

---

## 3. Objetivos y fases de crecimiento

| Fase | Usuarios | Transporte / Estado | Estado |
|------|----------|---------------------|--------|
| **1 — Actual** | ≤ 100 | Cloudflare Workers + Durable Objects (1 DO por canal/DM/usuario) | En producción |
| **2 — Futuro** | ≤ 1.000 | Por definir — el modelo de Durable Objects ya evita el cuello de botella de "1 solo proceso Node con Maps en memoria" que motivaba la fase 2 original (Redis pub/sub). El límite real a esta escala pasa a ser el throughput de un DO individual muy concurrido (ej. un canal masivo), no la falta de estado compartido entre instancias | Sin plan cerrado |
| **3 — Escala** | ≥ 10.000 | Por definir | Sin plan cerrado |

**Contexto histórico:** el roadmap original (fase 1 NestJS + Socket.io + `Map()` en memoria de un único proceso → fase 2 Redis pub/sub → fase 3 WebTransport) se escribió para la arquitectura vieja, retirada en agosto 2026 al migrar todo a Cloudflare (ver [[log.md]]). Los Durable Objects (`ChannelDO`, `DmDO`, `UserRegistryDO`, `RateLimiterDO`) cumplen hoy el rol que iba a cumplir Redis — dan estado consistente y aislado por entidad (canal, conversación, usuario) sin depender de que todas las peticiones caigan en el mismo proceso. La fase 2/3 de este roadmap está sin definir de nuevo porque el problema que resolvían ya no existe tal cual.

---

## 4. Stack tecnológico

### Frontend

| Tecnología | Rol |
|-----------|-----|
| **SvelteKit 5** | Framework de aplicación (SSR + cliente), adapter `@sveltejs/adapter-cloudflare` |
| **Vite** | Bundler y servidor de desarrollo |
| **Phaser 4** | Motor 2D para modo Spatial — presente en el repo, **no conectado** (ver sección 14) |
| **WebSocket nativo** | Comunicación en tiempo real (`src/lib/socket.ts`, wrapper propio con reconexión) |
| **LiveKit SDK** | Cliente de audio/vídeo (canales de voz) |

### Backend

| Tecnología | Rol |
|-----------|-----|
| **Hono** | Framework HTTP para Cloudflare Workers (routing REST) |
| **Durable Objects** | Estado y WebSocket en tiempo real — `ChannelDO`, `DmDO`, `UserRegistryDO`, `RateLimiterDO` |
| **Prisma 7** | ORM, cliente generado por app, sin `migrate` en runtime (solo `generate`) |
| **PostgreSQL** | Base de datos relacional (Supabase), accedida vía **Hyperdrive** (pooling/cache de Cloudflare) |
| **jose** | JWT (firma/verificación) — reemplaza `jsonwebtoken`, compatible con el runtime de Workers |
| **bcryptjs** | Hash de contraseñas — reemplaza `bcrypt` nativo, byte-compatible con hashes existentes |

### Servicios externos

| Servicio | Rol |
|---------|-----|
| **LiveKit** | SFU para audio/vídeo en canales de voz (modo Spatial dormido, ver sección 12) |
| **Cloudinary** | Almacenamiento de adjuntos, avatares e iconos de servidor — subida vía `fetch` firmado, sin SDK Node |
| **Google Drive** | Almacenamiento alternativo para adjuntos grandes — subida resumible vía `fetch` + OAuth2, sin `googleapis` |
| **Resend** | Envío de emails transaccionales (verificación, recuperación de contraseña) |
| **Supabase** | PostgreSQL gestionado, accedido a través de Cloudflare Hyperdrive |
| **Cloudflare Workers** | Hosting de frontend y backend — dominio propio `meado.es` / `www.meado.es` sobre el Worker de frontend |

Render y Vercel se usaron hasta agosto 2026 y están retirados (Vercel eliminado, Render suspendido como red de seguridad — ver [[log.md]]).

---

## 5. Arquitectura del sistema

```
┌──────────────────────────────────────────────────────────────────┐
│                        NAVEGADOR (Cliente)                        │
│                                                                    │
│  ┌──────────────────────┐   ┌─────────────────────────────────┐  │
│  │  SvelteKit (UI)       │   │  PhaserGame.svelte (SPATIAL)    │  │
│  │  Servidores, DMs,     │   │  Placeholder — sin conectar      │  │
│  │  Amigos, Perfil, Voz  │   │  ("Mapa 2D no disponible")       │  │
│  └──────────┬────────────┘   └───────────────────────────────────┘ │
│             │ WebSocket nativo (src/lib/socket.ts)                │
└─────────────┼──────────────────────────────────────────────────────┘
              │  wss://meado.es/ws/channel/:id
              │  wss://meado.es/ws/dm/:id
              │  wss://meado.es/ws/session   (siempre abierto)
              ▼
┌──────────────────────────────────────────────────────────────────┐
│         CLOUDFLARE WORKER — meado-frontend (meado.es)             │
│  SvelteKit SSR + assets estáticos                                 │
│  Proxy interno: /api/* → BACKEND_URL (src/routes/api/[...path])   │
└─────────────┬──────────────────────────────────────────────────────┘
              │ HTTP /api/* proxied, WS directo al backend Worker
              ▼
┌──────────────────────────────────────────────────────────────────┐
│      CLOUDFLARE WORKER — meado-backend (Hono, REST + /ws/*)       │
│                                                                    │
│  Rutas REST: /auth /servers /channels /dm /friends /users         │
│              /upload /drive                                       │
│                                                                    │
│  /ws/channel/:id ──▶ ChannelDO      (1 instancia por canal)       │
│  /ws/dm/:id      ──▶ DmDO           (1 instancia por conversación)│
│  /ws/session     ──▶ UserRegistryDO (1 instancia por usuario)     │
│                                                                    │
│  RateLimiterDO — contador de ventana fija, REST (por IP)          │
│                                                                    │
│  REST → DO: lib/broadcast.ts empuja eventos a los DOs activos     │
│         cuando una mutación llega por HTTP en vez de WS           │
└─────────────┬──────────────────────────────────────────────────────┘
              │ Hyperdrive (pool/cache)
              ▼
        PostgreSQL (Supabase)

Aparte, sin pasar por el backend:
  Canales de voz  ──▶  LiveKit SFU (token emitido por el backend, media directa cliente↔LiveKit)
```

Idea central: no hay un proceso Node persistente en ningún punto. Cada Durable Object es la única pieza con estado en memoria "de verdad", y está anclado a una entidad concreta (un canal, una conversación, un usuario) — nunca a un servidor físico fijo. Ver sección 11 para el detalle de cómo funciona cada DO.

---

## 6. Estructura del repositorio

```
meado/
├── apps/
│   ├── frontend/                        # SvelteKit 5, adapter-cloudflare
│   │   ├── wrangler.jsonc                # Worker config: assets, BACKEND_URL, custom domains
│   │   └── src/
│   │       ├── lib/
│   │       │   ├── auth.ts                 # Store: login/register/logout
│   │       │   ├── socket.ts               # WebSocket nativo: sesión + salas, reconexión con backoff
│   │       │   ├── livekit.ts              # Store: cliente LiveKit (voz)
│   │       │   ├── conversationsStore.ts   # Lista de conversaciones DM
│   │       │   ├── dmStore.ts              # Contador de no leídos DM
│   │       │   ├── serverUnread.ts         # No leídos por canal
│   │       │   ├── permissions.ts          # Helpers de permisos por rol
│   │       │   ├── theme.ts                # Tema (sistema/claro/oscuro)
│   │       │   ├── voicePrefs.ts           # Preferencias de voz persistidas
│   │       │   ├── voiceStore.ts           # Estado del canal de voz activo
│   │       │   ├── upload.ts               # Helper subida a Cloudinary
│   │       │   ├── driveUpload.ts          # Helper subida a Google Drive
│   │       │   ├── uploadStore.svelte.ts   # Progreso de subida (Svelte 5 runes)
│   │       │   ├── displayName.ts          # Utilidad nombre/username fallback
│   │       │   ├── ping.ts                 # Latencia WS
│   │       │   ├── types/
│   │       │   │   └── socket-events.types.ts  # Tipos de eventos WS — desactualizado, ver §11
│   │       │   ├── components/
│   │       │   │   ├── ProfileMenu.svelte
│   │       │   │   ├── ServerProfileCard.svelte
│   │       │   │   └── UserStatusBar.svelte
│   │       │   └── game/
│   │       │       ├── GameScene.ts        # Código muerto — nada lo importa (§14)
│   │       │       └── PhaserGame.svelte   # Stub: placeholder, no conecta Phaser (§14)
│   │       ├── routes/
│   │       │   ├── +layout.svelte / +layout.server.ts
│   │       │   ├── api/[...path]/+server.ts  # Proxy genérico /api/* → BACKEND_URL
│   │       │   ├── login/, register/, forgot-password/, reset-password/
│   │       │   ├── (app)/home/
│   │       │   │   ├── +page.svelte        # Hub de amigos y DMs
│   │       │   │   └── dm/[id]/+page.svelte
│   │       │   └── servers/
│   │       │       ├── +page.svelte        # Lista de servidores
│   │       │       └── [slug]/+page.svelte # Vista de servidor (canales, voz, ajustes)
│   │       └── hooks.server.ts             # Cookie → GET /api/auth/me → locals.user
│   │
│   └── backend-workers/                # Hono + Durable Objects, Cloudflare Workers
│       ├── wrangler.jsonc                # Hyperdrive, vars, bindings de los 4 DO
│       ├── prisma/
│       │   ├── schema.prisma              # Modelos de base de datos (fuente de verdad)
│       │   └── migrations/                # Historial de migraciones (rescatado de apps/backend, ver log.md)
│       ├── prisma.config.ts
│       └── src/
│           ├── index.ts                   # Hono app, middleware global, wiring de rutas
│           ├── env.ts                     # Interfaz de bindings (Env)
│           ├── hono-env.ts                # HonoEnv (Bindings + Variables.user)
│           ├── durable-objects/
│           │   ├── channel-do.ts          # ChannelDO — 1 por canal (texto o voz)
│           │   ├── dm-do.ts               # DmDO — 1 por conversación
│           │   ├── user-registry-do.ts    # UserRegistryDO — 1 por usuario, socket de sesión
│           │   └── rate-limiter-do.ts     # RateLimiterDO — contador genérico por ventana
│           ├── lib/
│           │   ├── broadcast.ts           # Puente REST → DO
│           │   ├── cloudinary.ts          # Subida/borrado firmado vía fetch
│           │   ├── db.ts                  # createDb(env) — Prisma + Hyperdrive
│           │   ├── dm-messages.ts         # Helpers DB de mensajes/reacciones DM
│           │   ├── drive.ts               # Google Drive resumable upload
│           │   ├── email.ts               # Resend
│           │   ├── friends.ts             # getFriendIds()
│           │   ├── google-auth.ts         # OAuth2 refresh token → access token
│           │   ├── jwt.ts                 # jose — login/verify/reset/socket
│           │   ├── messages.ts            # Helpers DB de mensajes/reacciones de canal
│           │   ├── password.ts            # bcryptjs
│           │   ├── storage.ts             # Dispatcher borrado Cloudinary/Drive
│           │   └── ws-protocol.ts         # Envelope { type, payload } — parse/send/broadcast
│           ├── middleware/
│           │   ├── auth.ts                # requireAuth (cookie "token")
│           │   └── rate-limit.ts          # rateLimit(kind, limit, windowMs) → RateLimiterDO
│           ├── routes/
│           │   ├── auth.ts, servers.ts, channels.ts, dm.ts
│           │   ├── friends.ts, users.ts, upload.ts, drive.ts
│           │   └── ws.ts                  # Upgrades WS → los 3 DO de sesión/canal/DM
│           └── shared/permissions.ts      # ServerPermissions (bitmask-like, TS)
│
├── CLAUDE.md                       # Instrucciones para Claude Code (no versionado, .gitignore)
├── log.md                          # Registro cronológico
├── objetivos.md                    # Plan de trabajo vivo
└── documentacion.md                # Este archivo
```

`apps/backend` (NestJS/Socket.io) existió hasta agosto 2026 y fue borrado tras el corte de DNS a Cloudflare — recuperable del historial git si hiciera falta (ver [[log.md]]).

---

## 7. Base de datos

Fuente de verdad única: `apps/backend-workers/prisma/schema.prisma`.

### Modelos

**User** — usuario registrado:
- Identidad: `id` (CUID), `username`, `email`, `passwordHash`, `emailVerified`, `role` (`ADMIN|USER|SUPERADMIN`)
- Perfil: `name`, `avatarUrl`, `bio`, `pronouns`, `bannerColor`
- Privacidad: `allowDmsFromServerMembers`, `allowFriendRequestsFromAll`, `showActivityStatus`
- Notificaciones: `notifDms`, `notifMentions`, `notifSounds`, `notifEmailDigest`

**Server** — servidor de comunicación: `name`, `slug` (único), `description`, `iconUrl`, `serverType` (`DISCORD|SPATIAL`), `accessType` (`PUBLIC|PASSWORD|WHITELIST`), `ownerId`

**Channel** — canal dentro de un servidor: `type` (`TEXT|VOICE`), `name`, `serverId`, `position`

**ServerRole** — rol personalizado por servidor: `name`, `color`, `permissions` (objeto TS tipo `ServerPermissions`, no un entero bitmask real — ver `shared/permissions.ts`)

**ServerMember** — membresía usuario-servidor: clave compuesta `[userId, serverId]`, `nickname` opcional, `roleId` opcional

**ServerWhitelist** — usuarios autorizados en servidores `WHITELIST`

**ServerBan** — `userId`, `serverId`, `reason`, `issuerId`

**ChannelRead** — `[userId, channelId]`, `lastReadAt`

**Message** / **Attachment** / **MessageReaction** — mensajes de canal y sus adjuntos/reacciones

**Friendship** — `senderId`, `receiverId`, `status` (`PENDING|ACCEPTED|BLOCKED`), `aliasBySender`, `aliasByReceiver`

**DirectConversation** / **DirectConversationMember** — conversación DM (1:1 o grupo), `canonicalKey` único para 1:1

**DirectMessage** / **DirectAttachment** / **DirectMessageReaction** — mensajes DM y sus adjuntos/reacciones

**Report** — `reporterId`, `targetUserId`, `reason`, `details`, `status` (`PENDING|REVIEWED|DISMISSED`)

### Configuración Prisma 7

La URL de conexión vive en `prisma.config.ts`, no en `schema.prisma`. El cliente generado se emite a `generated/prisma/` (ignorado por git) e importado como:

```typescript
import { PrismaClient } from '../../generated/prisma/client.js';
```

La extensión `.js` es obligatoria con el resolver `nodenext` aunque el fuente sea TypeScript.

**Cliente Prisma en los Durable Objects:** cada DO que toca la base de datos (`ChannelDO`, `DmDO`, `UserRegistryDO`) cachea su propio `PrismaClient` en un campo privado, creado una sola vez al primer uso — no en cada mensaje WS. Un bug real de fase 5 (cliente recreado por mensaje) quedó corregido con este patrón. Las rutas REST normales sí crean un cliente por request vía `createDb(env)`, que es correcto ahí porque cada request de Workers ya es un isolate nuevo.

---

## 8. Autenticación y perfiles

Auth JWT con cookie httpOnly. Firma/verificación con `jose` (no `jsonwebtoken` — incompatible con el runtime de Workers), hash de contraseña con `bcryptjs`.

### Endpoints (`/auth`)

| Endpoint | Descripción |
|----------|-------------|
| `POST /auth/register` | Crea cuenta no verificada, envía email de verificación (Resend). Sin auto-login. Rate limit: 5/hora por IP |
| `GET /auth/verify-email?token=xxx` | Marca `emailVerified: true`, redirige a `${FRONTEND_URL}/login` |
| `POST /auth/login` | Valida contraseña + verificación de email → cookie httpOnly `token` (7 días). Rate limit: 8/60s por IP |
| `POST /auth/forgot-password` | Envía email de recuperación. Rate limit: 3/hora por IP |
| `POST /auth/reset-password` | Valida token de reset, actualiza contraseña. Rate limit: 5/hora por IP |
| `GET /auth/me` | Devuelve `{ id, username, role, socketToken }` — `socketToken` es un JWT de 1h para los endpoints `/ws/*` |
| `POST /auth/logout` | Borra cookie |
| `PATCH /auth/avatar` | Sube avatar vía multipart → Cloudinary (máx. 10 MB, JPEG/PNG/GIF/WebP) |
| `PATCH /auth/profile` | Actualiza `{ name, bio, pronouns, bannerColor }` |
| `GET/PATCH /auth/privacy` | Lee/actualiza privacidad |
| `GET/PATCH /auth/notifications` | Lee/actualiza notificaciones |

**Primer usuario registrado es ADMIN automáticamente.**

### Tipos de JWT (`jose`, HS256)

| Tipo | Payload | Vida | Uso |
|------|---------|------|-----|
| `login` | `{sub, username, role}` | 7 días | cookie `token`, verificado por `requireAuth` en toda ruta REST protegida |
| `verify` | `{sub, email, type:'verify'}` | 24h | link de verificación de email |
| `reset` | `{sub, type:'reset'}` | 1h | link de recuperación de contraseña |
| `socket` | `{type:'socket', id, username, role, avatarUrl}` | 1h | query param `?token=` en los upgrades `/ws/*`, verificado de forma independiente por cada Durable Object |
| `drive-nonce` | ad-hoc | 2h | confirmación de subida a Google Drive (ver §13) |

El socket token ya no viaja en un `handshake.auth.token` de Socket.io — se pasa como query string porque el upgrade WebSocket de Workers es una request HTTP normal antes de convertirse en WS.

---

## 9. Servidores y canales

### Tipos de servidor

- **DISCORD**: canales de texto y voz — el flujo activo hoy.
- **SPATIAL**: mapa 2D con Phaser + audio de proximidad. Seleccionable al crear servidor, pero el frontend no conecta el mapa ni el audio de proximidad (§14) — se comporta como un servidor vacío con un aviso de "no disponible todavía".

### Acceso a servidores

- **PUBLIC**: cualquier usuario autenticado puede unirse.
- **PASSWORD**: requiere `{ password }` en `POST /servers/:slug/join` — verificado con bcrypt.
- **WHITELIST**: solo usuarios añadidos por el admin.

### Roles y permisos

Cada servidor puede tener roles personalizados (`ServerRole`) con un campo `permissions` (objeto tipado, `shared/permissions.ts`). Un `ServerMember` puede tener un rol asignado con permisos adicionales sobre ese servidor.

### Endpoints de servidores (`/servers`, requiere sesión)

| Endpoint | Descripción |
|----------|-------------|
| `GET /servers` | Lista servidores del usuario |
| `POST /servers` | Crea servidor (solo ADMIN/SUPERADMIN de plataforma) |
| `GET /servers/:slug` | Detalle de servidor |
| `GET /servers/:slug/voice-state` | Roster de voz de todos los canales del servidor (agrega `ChannelDO.getVoiceRoster()` de cada canal) |
| `GET /servers/:slug/unread` | Canales con mensajes no leídos |
| `PATCH /servers/:slug/icon` | Icono → Cloudinary |
| `PATCH /servers/:slug` | Actualiza servidor |
| `DELETE /servers/:slug` | Elimina servidor |
| `GET /servers/:slug/livekit-token` | Token LiveKit sala `spatial-{slug}` — endpoint vivo, **sin consumidor en el frontend actual** (§12) |
| `POST /servers/:slug/join` / `POST /servers/:slug/leave` | Unirse / salir |
| `GET /servers/:slug/members` | Lista de miembros |
| `DELETE /servers/:slug/members/:userId` | Expulsar |
| `PATCH /servers/:slug/members/:userId/nickname` | Apodo |
| `PATCH /servers/:slug/members/:userId/role` | Asignar rol |
| `POST /servers/:slug/bans` / `DELETE /servers/:slug/bans/:userId` / `GET /servers/:slug/bans` | Bans |
| `POST /servers/:slug/channels` / `PATCH .../:channelId` / `DELETE .../:channelId` | Canales |
| `GET/POST /servers/:slug/whitelist` / `DELETE .../:userId` | Whitelist |
| `GET/POST /servers/:slug/roles` / `PATCH/DELETE .../:roleId` | Roles |

### Endpoints de canales (`/channels`, requiere sesión)

| Endpoint | Descripción |
|----------|-------------|
| `PATCH /channels/:channelId/read` | Marcar como leído |
| `GET /channels/:channelId/messages` | Historial paginado (`before` + `limit`) |
| `POST /channels/:channelId/messages` | Enviar mensaje (texto + adjunto opcional) — vía REST, no WS |
| `PATCH /channels/:channelId/messages/:messageId` | Editar propio |
| `DELETE /channels/:channelId/messages/:messageId` | Borrar (propio o admin plataforma) |
| `GET /channels/:channelId/livekit-token` | Token LiveKit para canal de voz — en uso activo |

---

## 10. Amigos y mensajes directos

### Amigos (`/friends`, requiere sesión)

| Endpoint | Descripción |
|----------|-------------|
| `GET /friends` | Lista con estado online |
| `GET /friends/pending` | Solicitudes pendientes |
| `POST /friends/request` | `{ identifier }` (username o email) |
| `POST /friends/accept/:id` | Aceptar |
| `PATCH /friends/:id/alias` | Alias personalizado |
| `DELETE /friends/:id` | Eliminar amistad |
| `POST /friends/block/:targetId` / `DELETE /friends/block/:targetId` | Bloquear / desbloquear |

`Friendship.status = BLOCKED` cubre ambos sentidos según `senderId`.

### Mensajes directos (`/dm`, requiere sesión)

| Endpoint | Descripción |
|----------|-------------|
| `GET /dm` | Lista de conversaciones |
| `POST /dm` | Crear/obtener 1:1 (`{ userIds }`) o grupo (`{ userIds, name, group: true }`) |
| `GET /dm/:id/messages` | Historial paginado |
| `POST /dm/:id/messages` | Enviar (texto + adjunto opcional) |
| `POST /dm/:id/members` | Añadir a grupo |
| `PATCH /dm/:id/messages/:messageId` | Editar propio |
| `DELETE /dm/:id/messages/:messageId` | Borrar propio |

### Usuarios (`/users`, requiere sesión)

| Endpoint | Descripción |
|----------|-------------|
| `GET /users/search?q=...` | Username o email, mínimo 2 caracteres |
| `GET /users/:id/profile` | Perfil público: bio, pronombres, amigos/servidores en común, estado de amistad |
| `POST /users/:id/report` | Límite: 1 reporte por usuario cada 24h |

---

## 11. Comunicación en tiempo real

No hay un único Gateway como antes — hay **tres tipos de WebSocket**, cada uno resuelto por un Durable Object distinto, más un puente REST→DO para cuando una mutación llega por HTTP.

### Los tres WebSocket

| Endpoint | Durable Object | Cardinalidad |
|----------|----------------|--------------|
| `GET /ws/channel/:channelId?token=` | `ChannelDO` | 1 instancia por canal (texto o voz) |
| `GET /ws/dm/:conversationId?token=` | `DmDO` | 1 instancia por conversación |
| `GET /ws/session?token=` | `UserRegistryDO` | 1 instancia por usuario — se abre al iniciar sesión y se mantiene todo el rato, independiente de qué canal/DM tengas abierto |

`token` es el `socketToken` de `GET /auth/me`, verificado de forma independiente por cada DO en su `fetch()`.

### El WS mismo es el join/leave

No existen `channel:join`, `channel:leave`, `dm:join`, `dm:leave`, `voice:leave` ni `server:subscribe` como mensajes — abrir la conexión a `/ws/channel/:id` **es** unirse a ese canal; cerrarla **es** salir. Esto reemplaza al modelo anterior de "un socket, múltiples salas Socket.io" por "una conexión por sala realmente abierta en pantalla" + una conexión de sesión siempre activa para presencia/DMs en segundo plano.

`src/lib/types/socket-events.types.ts` en el frontend **todavía declara estos eventos viejos** — es tipado muerto, no afecta en runtime (el wire protocol real es `{ type: string, payload: unknown }` sin tipos estrictos de por medio), pero conviene limpiarlo si se toca ese archivo.

### Mensajes WS por Durable Object

**`ChannelDO`** — cliente → servidor: `message:send {content}`, `reaction:toggle {messageId,emoji}`, `typing:start`, `typing:stop`.
Servidor → cliente: `voice:state {channelId,members}` (al conectar, si es canal de voz), `voice:joined {channelId,member}`, `voice:left {channelId,userId}`, `message:created`, `message:updated`, `message:deleted {messageId,channelId}`, `reaction:updated`, `typing:update {channelId,usernames}`.

Si el canal es de voz, al conectar el DO hace un handshake con el `UserRegistryDO` del usuario para expulsarlo de cualquier otra sala de voz donde estuviera — invariante dura: **una sola sala de voz activa por usuario**, aplicada en servidor. El roster de voz se deriva en vivo de `ctx.getWebSockets('voice')` (nunca un Map aparte), así que no puede desincronizarse.

**`DmDO`** — cliente → servidor: `dm:send {content}`, `dm:reaction:toggle {messageId,emoji}`, `dm:typing:start`, `dm:typing:stop`.
Servidor → cliente: `dm:message:created`, `dm:message:updated`, `dm:message:deleted {messageId,conversationId}`, `dm:reaction:updated`, `dm:typing:update {conversationId,usernames}`, `dm:member:added {conversationId,member}`.

Además, cuando llega un mensaje nuevo, `DmDO` empuja una preview a la `UserRegistryDO` de cada miembro que **no** tenga esa conversación abierta ahora mismo (`dm:message:created`/`dm:conversation:joined` por el socket de sesión) — así el sidebar de DMs se actualiza aunque no tengas la conversación en pantalla.

**`UserRegistryDO`** (sesión) — no recibe mensajes del cliente, solo empuja: `presence:update {userId,online}` (a los amigos, solo en la transición 0→1 conexiones o al cerrar la última), `friend:request`, y las previews de DM mencionadas arriba.

### Rate limiting

**WS** (`UserRegistryDO.checkRateLimit`, en memoria, por usuario):
| Bucket | Límite |
|--------|--------|
| `msg` (`message:send` + `dm:send`, compartido) | mínimo 500 ms entre envíos |
| `reaction` (`reaction:toggle` + `dm:reaction:toggle`, compartido) | mínimo 250 ms entre toggles |

Existe una constante `voiceJoin` (2000 ms) sin usar en ningún sitio — unirse a voz ya no es una acción discreta rate-limitable, es abrir un WS.

**REST** (`RateLimiterDO`, contador de ventana fija persistido en storage del DO, por `kind:ip`):
| Ruta | Límite |
|------|--------|
| Global (todo excepto `/ws/*` y las 4 rutas siguientes) | 120 req / 60s por IP |
| `POST /auth/register` | 5 / hora |
| `POST /auth/login` | 8 / 60s |
| `POST /auth/forgot-password` | 3 / hora |
| `POST /auth/reset-password` | 5 / hora |

---

## 12. Audio y vídeo — LiveKit

LiveKit actúa como **SFU**: recibe streams de medios y los reenvía selectivamente sin procesarlos.

### Canales de voz (activo)

Token vía `GET /channels/:channelId/livekit-token`, sala = `channelId`. El backend verifica membresía del servidor antes de emitir el token. Toda la UI de voz (mic, pantalla, dispositivos, hablantes activos) vive en `src/lib/livekit.ts` y está activamente mantenida.

### Servidores Spatial (endpoint vivo, sin consumidor)

`GET /servers/:slug/livekit-token` (sala `spatial-{slug}`) sigue existiendo en el backend y respondería si se llamara, pero **el frontend nunca lo llama** — `PhaserGame.svelte` no conecta ni el mapa ni el audio. Ver sección 14 para el detalle.

### Configuración crítica de LiveKit (no cambiar)

- `adaptiveStream: false` — evita que los tracks se pausen en elementos ocultos.
- Tracks remotos adjuntados manualmente: `track.attach()` en `TrackSubscribed`, elemento añadido a `document.body` con `display: none`.
- Pipeline de micrófono: `getUserMedia → AudioContext → GainNode → AnalyserNode → MediaStreamDestinationNode → publishTrack`.

---

## 13. Subida de archivos

### Cloudinary (`POST /upload`)

Sin SDK Node (incompatible con Workers) — subida firmada vía `fetch` directo a la API REST de Cloudinary: firma = `SHA-1(parámetros ordenados "k=v&k=v" + api_secret)` calculada con WebCrypto (`crypto.subtle.digest`).

- Máximo 25 MB, SVG bloqueado (riesgo XSS)
- Devuelve `{ url, name, size, mimeType }`
- Avatar (`PATCH /auth/avatar`) tiene su propio límite más estricto: 10 MB, solo JPEG/PNG/GIF/WebP (allowlist, no necesita bloquear SVG aparte)
- Borrado (`deleteCloudinaryByUrl`) también vía `fetch`, best-effort — no falla la operación principal si el borrado falla

### Google Drive (subida en dos pasos)

Sin `googleapis` — `fetch` directo contra la API REST v3 de Drive. Access token obtenido en cada uso a partir de un `GOOGLE_REFRESH_TOKEN` guardado (OAuth2).

1. `POST /drive/init-upload` `{ filename, mimeType }` → sesión de subida resumable (`uploadType=resumable`) + `{ uploadUrl, nonce }`
2. Cliente sube directo a `uploadUrl` (sin pasar por el backend)
3. `POST /drive/confirm` `{ fileId, nonce }` → hace el archivo público (`role:reader, type:anyone`), devuelve URL `drive.google.com/uc?export=view&id=...`

**Cambio de diseño respecto al backend viejo:** antes el nonce se validaba contra un `Set` en memoria de un proceso único (uso único real). En Workers no hay proceso único que sobreviva entre requests, así que el nonce ahora es un JWT firmado (`jose`, tipo `drive-nonce`, 2h) — se verifica por firma, no por membresía en un set. Se pierde la garantía estricta de "uso único", se mantiene "fue emitido legítimamente por `init-upload`". Trade-off consciente, no un bug.

### Validación de adjuntos

Solo se aceptan URLs con prefijo `https://res.cloudinary.com/` o `https://drive.google.com/`.

---

## 14. Motor gráfico — Phaser (modo Spatial, inactivo)

**Estado actual: código presente, sin conectar.** No es una regresión de la migración a Cloudflare — el protocolo de movimiento 2D (`room:join`/`player:move`/`player:moved`) **nunca se implementó en el backend**, ni siquiera en la época de NestJS/Socket.io. Se declaró explícitamente fuera de alcance al diseñar la migración (ver `objetivos.md`, fase 4).

- `src/lib/game/GameScene.ts` (298 líneas) sigue en el repo pero **nada lo importa** — código muerto.
- `src/lib/game/PhaserGame.svelte` (52 líneas) es un stub: conecta el socket de sesión si hace falta y renderiza `<p>Mapa 2D no disponible todavía.</p>`. No importa Phaser ni `GameScene.ts`.
- Se sigue pudiendo crear un servidor `SPATIAL` desde la UI — el resultado es un servidor con la cromática estándar de Discord más ese placeholder en vez de mapa, y sin audio de proximidad conectado (aunque el endpoint LiveKit para ello sigue vivo, §12).

Lo que queda documentado abajo es el **diseño original**, por si se retoma:

### Importación dinámica (diseño previsto)

```javascript
const [Phaser, { createGameScene }] = await Promise.all([
  import('phaser'),
  import('./GameScene.js')
]);
```

Dentro de `onMount` porque SvelteKit ejecuta código en servidor durante el build y Phaser usa APIs de navegador inexistentes en Node.

### Factory function

`GameScene.ts` exporta `createGameScene(Phaser, socket, config)` — la clase se define a nivel de módulo pero recibe socket y configuración en tiempo de ejecución.

### Interpolación y throttle de posición (diseño previsto)

- Emisión de posición: 20 Hz con comprobación de timestamp dentro de `update()` de Phaser, nunca `setInterval`.
- Interpolación de avatares remotos por decaimiento exponencial: `alpha = 1 − lerpStiffness^deltaTime`.

---

## 15. Entorno de desarrollo

### Requisitos previos

- Node.js 20+
- npm 10+
- Acceso a PostgreSQL (Supabase o local)
- Cuenta Cloudflare + `wrangler` autenticado (`npx wrangler login`) para levantar el backend con Hyperdrive real; sin login, `wrangler dev` cae a `DATABASE_URL` directo como fallback local

### Arrancar en local

**Terminal 1 — Backend:**
```bash
cd apps/backend-workers
npm install
npm run dev               # wrangler dev, localhost:8787
```

**Terminal 2 — Frontend:**
```bash
cd apps/frontend
npm install
npm run dev                # localhost:5173
```

El proxy de Vite reescribe `/api` y el WS hacia el backend local. Todas las llamadas HTTP del frontend usan `/api/...` — nunca la URL directa del backend.

### Comandos útiles

**Backend (`apps/backend-workers`):**
```bash
npm run dev              # wrangler dev, hot reload
npm run build             # prisma generate
npm run deploy             # build + wrangler deploy
npm run typecheck          # tsc --noEmit
npx prisma migrate dev    # crear y aplicar migración
npx prisma studio         # explorador visual de la base de datos
```

**Frontend:**
```bash
npm run dev              # desarrollo
npm run build            # build de producción
npm run check            # type check (svelte-check)
npm run lint              # Prettier + ESLint
npm run format             # Prettier (escritura)
```

---

## 16. Infraestructura y despliegue

No hay CI/CD configurado — el despliegue es manual, vía `wrangler deploy` desde cada app.

```
apps/backend-workers   →  npm run deploy  →  meado-backend.luka-lopez-j.workers.dev
apps/frontend           →  npm run deploy  →  meado.es / www.meado.es (custom domain)
                                              →  meado-frontend.luka-lopez-j.workers.dev (workers.dev, activo)
```

### Backend — Cloudflare Workers

- `wrangler.jsonc`: binding `HYPERDRIVE` hacia Supabase, bindings de los 4 Durable Objects, secrets vía `wrangler secret put` (no en el archivo — evita que credenciales queden en git)
- Build: `npm run build` → `prisma generate`
- Deploy: `wrangler deploy`

### Frontend — Cloudflare Workers

- Adapter: `@sveltejs/adapter-cloudflare`
- `wrangler.jsonc`: `assets.run_worker_first: ["/*"]` — necesario porque, sin esto, Cloudflare intenta servir cualquier ruta como asset estático antes de invocar el Worker, y `/api/*` (que no tiene archivo estático) recibía el 404 genérico de Cloudflare en vez de llegar al proxy (`src/routes/api/[...path]/+server.ts`)
- `routes`: `meado.es` y `www.meado.es` como `custom_domain: true` — reemplazaron los registros DNS que apuntaban a Vercel (6 registros A borrados manualmente en el dashboard de Cloudflare antes de poder atar el custom domain, ver `log.md` 2026-08-02)
- `workers_dev: true` — mantiene también accesible `meado-frontend.luka-lopez-j.workers.dev` como URL de respaldo/debug

### DNS

Zona `meado.es` en Cloudflare (nameservers `magdalena.ns.cloudflare.com` / `razvan.ns.cloudflare.com`). Registros DNS residuales conservados: 3 `CAA` (autorización de CAs, no interfieren) y el `TXT resend._domainkey` (DKIM de Resend — **no tocar**, rompe entrega de emails salientes si se borra).

---

## 17. Variables de entorno

### Backend (`apps/backend-workers`)

Secrets vía `wrangler secret put <NAME>` en producción; local vía `.env` (fallback de `wrangler dev`).

| Variable | Descripción |
|----------|-------------|
| `DATABASE_URL` | Connection string PostgreSQL — fallback local, en producción se usa el binding `HYPERDRIVE` |
| `JWT_SECRET` | Secreto para firmar todos los JWT (`jose`) |
| `CORS_ORIGIN` | Orígenes permitidos, separados por coma |
| `NODE_ENV` | `production` en Cloudflare |
| `FRONTEND_URL` | URL del frontend, para emails y redirecciones |
| `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` | LiveKit |
| `RESEND_API_KEY`, `RESEND_FROM` | Resend |
| `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` | Cloudinary |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN`, `GOOGLE_DRIVE_FOLDER_ID` | Google Drive |

### Frontend (`apps/frontend`)

| Variable | Descripción |
|----------|-------------|
| `BACKEND_URL` | URL del backend, usada server-side por el proxy `/api/*` y por `hooks.server.ts` |
| `VITE_SOCKET_URL` | URL del backend para WebSocket (vacío en dev → mismo host que `location`) |
| `VITE_LIVEKIT_URL` | URL del servidor LiveKit |

> Las variables `VITE_*` se incrustan en el bundle en build time — no incluir secretos con este prefijo.

---

## 18. Convenciones y decisiones de diseño

### Un DO por entidad, no un Gateway único

El viejo `MessagesGateway` (NestJS/Socket.io) gestionaba todo desde un único proceso. Ahora cada canal, cada conversación DM y cada usuario tiene su propio Durable Object — el aislamiento es por diseño, no por elección de escala. Ver §11.

### Identidad desde el JWT, nunca del cliente

Todos los DO y toda ruta REST protegida extraen `userId`/`username` del JWT verificado. El payload de cualquier mensaje WS o body de request nunca es fuente de verdad para la identidad del emisor.

### Un slot de voz por usuario

Invariante dura aplicada server-side: al conectar a un canal de voz, `ChannelDO` hace un handshake con la `UserRegistryDO` del usuario para expulsarlo de cualquier otra sala de voz activa. El estado de "canal de voz activo" se persiste en el storage de `UserRegistryDO` (sobrevive hibernación del DO), no en memoria volátil.

### El WS es el join/leave

No hay eventos explícitos de unirse/salir de sala — abrir/cerrar la conexión WS cumple ese rol. Ver §11 para el detalle de por qué esto reemplazó al modelo Socket.io de "un socket, N salas".

### Nonce firmado en vez de Set en memoria (Google Drive)

Sin proceso persistente no hay dónde guardar un `Set` de nonces de un solo uso real. Se sustituyó por un JWT firmado de vida corta — trade-off documentado en §13, no un descuido.

### Cliente Prisma cacheado por instancia de Durable Object

Cada DO que toca la base de datos crea su `PrismaClient` una sola vez (en el primer uso) y lo reutiliza mientras esa instancia del DO esté viva, en vez de crear uno nuevo por mensaje WS — bug real encontrado y corregido en fase 5 de la migración.

### Adjuntos: solo Cloudinary o Drive

El servidor valida que las URLs de adjuntos empiecen por `https://res.cloudinary.com/` o `https://drive.google.com/` antes de persistirlas. SVG bloqueado en subida genérica por riesgo XSS.

### Prisma 7: datasource en `prisma.config.ts`

Separa la URL de conexión del esquema. Ejecutado por la CLI de Prisma con `tsx`, fuera del árbol de compilación TypeScript normal del proyecto.

### Sin CI/CD

Despliegue manual vía `wrangler deploy` en cada app — no hay GitHub Actions ni pipeline automático. Decisión implícita del estado actual del repo, no necesariamente definitiva.

---

*Documento actualizado: 2026-08-02 — reescrito por completo tras la migración a Cloudflare Workers (Hono + Durable Objects) y el borrado de `apps/backend` (NestJS viejo). Ver `log.md` para el detalle cronológico de la migración.*
