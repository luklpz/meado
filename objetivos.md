# Objetivos — Meado

Registro de objetivos del proyecto: qué se ha hecho ya y qué queda pendiente. Se actualiza a medida que se completan o se añaden tareas.

---

## Completado

### Core (servidores, canales, DMs, amigos)
- Auth JWT con cookies httpOnly, verificación de email (Resend), primer usuario = ADMIN
- Servidores (PUBLIC / PASSWORD / WHITELIST), canales de texto y voz, roles con permisos bitmask
- Sistema de amigos + presencia online/offline
- Mensajes directos (1:1 y grupo), typing indicators, reacciones con emoji
- Perfil de usuario: bio, pronombres, color de banner, avatar
- Bloqueo de usuarios, privacidad (DMs/friend requests), notificaciones (config), reporte de usuarios
- Subida de archivos: Cloudinary (≤25MB, sin SVG) + Google Drive (resumable, archivos grandes)
- Servidor tipo SPATIAL: mapa 2D con Phaser, audio de proximidad vía LiveKit
- Notificaciones de navegador (tab en background)
- Unread badges por canal (persistidos, `ChannelRead`) y por servidor

### Hardening / seguridad (previo a release público)
- Auth hardening, autenticación de mensajes reforzada
- Fix de race condition en reacciones (channel + DM)
- Fix de broadcast routing incorrecto en DMs
- Fix de inyección CSS
- Fix de estado corrupto en servidores PASSWORD
- Trim de orígenes CORS
- Fix de mensajes obsoletos (stale) al cambiar de canal rápido
- Manejo de errores de red en fetch de friends/DM (home)
- Feedback de error en UI (varias pantallas)

### Release público
- `.gitignore` raíz (excluye `.claude/` y config local)
- README completo + documentación expandida (`documentacion.md`)
- Repo preparado y publicado

---

## En progreso

### Migración completa a Cloudflare (frontend + backend)
Objetivo: mover Vercel → Cloudflare Pages y Render → Cloudflare Workers/Durable Objects, todo en una misma plataforma.

- [x] **Frontend, código migrado**: `@sveltejs/adapter-cloudflare` sustituye `adapter-auto`, `wrangler.jsonc` añadido, `vercel.json` eliminado. El rewrite de `/api/*` se implementó como proxy real dentro de SvelteKit (`src/routes/api/[...path]/+server.ts`, forward genérico de método/headers/body/cookies hacia `BACKEND_URL`) en vez de `_redirects`, porque el proxy con status 200 de Pages no está confirmado como soportado en el nuevo runtime de Workers assets. Verificado local: `npm run build` OK, `wrangler dev` levanta el Worker, página `/login` responde 200, `/api/auth/me` proxied devuelve el mismo body/status (401) que pegarle directo al backend.
- [ ] **Frontend, desplegar**: falta crear el proyecto en el dashboard de Cloudflare (Workers), configurar env vars (`BACKEND_URL`, `VITE_SOCKET_URL`, `VITE_LIVEKIT_URL`) como secrets/vars, y cortar DNS de `meado.es` desde Vercel — se hace junto al deploy del backend (fase 6), no antes

**Backend — plan aprobado, reescritura completa a Hono + Durable Objects (no Socket.io, no NestJS en Workers). Detalle completo del diseño en `C:\Users\luka\.claude\plans\wiggly-swinging-tulip.md`. Decisiones clave: fuera de alcance el juego espacial 2D (sin uso real hoy); modelo de conexión = 1 socket de sesión (presencia/DMs en background) + 1 socket por sala realmente abierta en pantalla; invariante dura de una sola sala de voz activa por usuario, enforced server-side vía `UserRegistryDO`.**

- [x] **Fase 1 — scaffold + slice vertical de auth**: proyecto `apps/backend-workers` creado. Hono, `pg` directo a `env.DATABASE_URL` (Hyperdrive real pendiente de fase 6, requiere `wrangler login`), `jose` (reemplaza `jsonwebtoken`), `bcryptjs` (reemplaza `bcrypt`, confirmado byte-compatible con hashes existentes), Cloudinary vía `fetch` firmado (sin SDK). Módulo `auth` completo (register/verify-email/login/logout/forgot-reset-password/me/avatar/profile/privacy/notifications). Verificado end-to-end contra Supabase real, incluido login completo con cuenta de prueba. Hueco conocido: rate limiting de estos endpoints aún no portado (pendiente antes de fase 6)
- [x] **Fase 2 — resto de controllers REST**: `servers`, `channels`, `dm`, `friends`, `users`, `upload` (Cloudinary), `drive` (Google Drive vía `fetch` + refresh token OAuth2, sin `googleapis`) — todos portados y verificados de solo lectura contra Supabase real. Puente REST→DO (broadcasts) y presencia (`onlineUsers`) quedan como stubs explícitos hasta la fase 3
- [ ] **Fase 3 — Durable Objects (gateway realtime)**: `ChannelDO` (voz+typing+mensajes por canal), `DmDO` (por conversación), `UserRegistryDO` (sharded, presencia + rate limits globales + puntero de voz activa). Handshake de expulsión de voz entre DOs, fan-out de DM hacia `UserRegistryDO` de cada miembro
- [ ] **Fase 4 — reescritura `lib/socket.ts`**: wrapper `WebSocket` nativo con superficie `.on()/.off()/.emit()`, modelo sesión+salas, reconexión/backoff propio (Socket.io lo daba gratis)
- [ ] **Fase 5 — verificación end-to-end local**: `wrangler dev` frontend+backend contra Hyperdrive+Supabase real, recorrido completo de eventos y edge cases
- [ ] **Fase 6 — deploy conjunto**: `wrangler deploy` de ambos a la vez, secrets, DNS `meado.es`, smoke test con cuenta de prueba, actualizar roadmap de `CLAUDE.md`, apagar Render

**Por qué:** tener frontend+backend en la misma plataforma (Cloudflare) simplifica gestión, y Workers no duerme por inactividad a diferencia de Render free tier. Socket.io no corre en Workers (no hay proceso Node persistente) — de ahí la reescritura a WebSocket nativo + Durable Objects en vez de un simple cambio de host.

---

## Pendiente / backlog

- **Redis (Fase 2 del roadmap)**: sustituir Maps en memoria de `MessagesGateway` (voz, typing, online) por Redis pub/sub para escalar a ≤1.000 usuarios
- **Monolith split incompleto**: `ServerSettings` (panel de ajustes) y panel de voz siguen acoplados en `servers/[slug]/+page.svelte`, pendiente extraer a componentes
- **Push notifications del SO** (tab cerrada): requiere Service Worker + VAPID + gestión de subscripciones en backend
- **Rail badges de servidor en tiempo real**: no se actualizan al recibir mensajes en otro servidor sin recargar (falta evento socket a nivel de servidor)
- **Invite links**: falta endpoint `POST/GET /servers/:slug/invite` y UI asociada
- Verificar que las vars de Cloudinary estén correctamente configuradas en Render (producción)
- Limpieza de directorio basura `apps/backend/apps/backend/` si sigue existiendo

---

## Cómo usar este archivo

Al completar un objetivo, moverlo de "Pendiente" a "Completado" con una línea breve. Al surgir un objetivo nuevo, añadirlo a "Pendiente / backlog" con contexto mínimo (qué y por qué).
