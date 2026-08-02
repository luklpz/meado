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
- [x] **Fase 3 — Durable Objects (gateway realtime)**: `ChannelDO` (voz+typing+mensajes por canal), `DmDO` (por conversación), `UserRegistryDO` (**un DO por usuario**, no sharded por hash como decía el plan original — más simple y suficiente a esta escala). Handshake de expulsión de voz entre DOs, fan-out de DM hacia `UserRegistryDO` de cada miembro, `channel:join`/`leave`/`voice:leave` eliminados como mensajes (el WS mismo es el join/leave). Verificado con WebSockets reales (no mocks): mensajes, typing (bug de auto-eco encontrado y corregido), rate limit, roster de voz. Pendiente para fase 5: expulsión cruzada entre 2 salas de voz distintas y fan-out de presencia/DM en vivo (no se probaron por falta de una segunda sala de voz de prueba y para no tocar cuentas reales de otros usuarios)
- [x] **Fase 4 — reescritura `lib/socket.ts`**: wrapper `WebSocket` nativo, modelo sesión+salas implementado (`socketStore.connect()`/`joinChannel()`/`joinDm()`), reconexión/backoff propio, `channel:join/leave`/`dm:join/leave`/`voice:leave`/`server:subscribe` eliminados del cliente (conectar/cerrar la conexión ES el join/leave). Juego espacial desactivado (fuera de alcance). **Verificado en navegador real** (no solo scripts): login SSR, mensaje de canal en vivo, canal de voz con LiveKit + roster — todo contra `apps/backend-workers` real. `vite.config.ts`/`.env` actualizados a apuntar al backend nuevo por defecto en dev
- [x] **Fase 5 — verificación end-to-end local**: rate limiting REST portado (`RateLimiterDO`, cierra hueco de fase 1), presencia/DM en vivo y expulsión cruzada de voz probados con una segunda cuenta de prueba real (`TestAccount2`). **2 bugs reales encontrados y corregidos**: `UserRegistryDO.webSocketClose` llamaba `ws.close()` sobre un socket ya cerrado (probablemente abortaba la notificación de `presence:update` offline); cliente Prisma se recreaba en cada mensaje WS dentro de los DOs (ahora cacheado por instancia). **Duda abierta**: el cierre de WS del lado cliente tras una expulsión de voz no completa en `wrangler dev` local (se queda en `CLOSING`) aunque el servidor sí aplica el invariante correctamente — puede ser límite de Miniflare local, verificar explícitamente al desplegar en fase 6
- [x] **Fase 6 — deploy conjunto**: backend y frontend desplegados y verificados contra Cloudflare real, con secrets configurados y Hyperdrive delante de Supabase. Zona `meado.es` añadida a Cloudflare (nameservers verificados, "Active"), 6 registros DNS residuales de Vercel (A de apex/www/wildcard) borrados por bloquear el custom domain, DNS cortado: `meado.es`/`www.meado.es` sirven desde `meado-frontend` (Cloudflare Worker), proxy `/api/*` verificado funcionando en dominio propio. Verificado con curl + navegador real. Detalle en `log.md` (entrada 2026-08-02). **Corrección 2026-08-02 (posterior):** el 404 de `/api/*` en `meado-frontend.luka-lopez-j.workers.dev` sigue reproduciéndose — no era solo un hallazgo de fase 6 ya resuelto, es una limitación permanente confirmada de los dominios compartidos `*.workers.dev` (probable reserva de Cloudflare en ese path). `workers_dev: true` sirve HTML/assets estáticos ahí, pero cualquier llamada `/api/*` (login incluido) rompe. Solo `meado.es`/`www.meado.es` son fiables para probar la app completa
- [x] **Fase 6 — cierre**: `CLAUDE.md` actualizado (API URL strategy, env vars de producción — ya no Render/Vercel). Vercel: proyecto eliminado. Render: suspendido (no borrado, por si hace falta rollback rápido)

**Por qué:** tener frontend+backend en la misma plataforma (Cloudflare) simplifica gestión, y Workers no duerme por inactividad a diferencia de Render free tier. Socket.io no corre en Workers (no hay proceso Node persistente) — de ahí la reescritura a WebSocket nativo + Durable Objects en vez de un simple cambio de host.

**Migración a Cloudflare completa.** `meado.es` en producción real sirve desde Cloudflare Workers, Vercel eliminado, Render suspendido.

- [x] **Bug real encontrado y corregido: WS en producción apuntaba a un 404** (2026-08-02): `VITE_SOCKET_URL` vacío en el build de producción hacía que el cliente conectase el WebSocket al mismo origen (`meado.es`), que no tiene ruta `/ws/*` — solo `/api/*` está proxeado. Mensajes en vivo, voz y presencia llevaban rotos desde el corte de DNS sin que nadie lo notara (la UI carga bien, el fallo es silencioso). Corregido añadiendo dominio propio al backend (`api.meado.es`, custom domain), `.env.production` con `VITE_SOCKET_URL=https://api.meado.es`, `BACKEND_URL` actualizado. `workers_dev` desactivado en ambos Workers (frontend por dashboard, backend como efecto colateral de `wrangler deploy` sin `workers_dev` declarado — ahora explícito en `wrangler.jsonc`). Verificado con curl (`api.meado.es/ws/session` → 401 real, no 404) y **confirmado en vivo por el usuario** (mensajes y voz funcionan en `meado.es` real)

- [x] **`documentacion.md` reescrito por completo** (2026-08-02): reflejaba la arquitectura NestJS/Socket.io/Render vieja al 100%, nunca se sincronizó durante la migración. Ahora describe Hono + Durable Objects, el modelo WS de 3 tipos de conexión, rate limiting real, y deja constancia explícita de que el modo Spatial/Phaser está presente en código pero desconectado (no es regresión de esta migración, nunca se implementó el protocolo de movimiento ni en el backend viejo)

---

## Pendiente / backlog

- **Redis (Fase 2 del roadmap)**: sustituir Maps en memoria de `MessagesGateway` (voz, typing, online) por Redis pub/sub para escalar a ≤1.000 usuarios
- **Monolith split incompleto**: `ServerSettings` (panel de ajustes) y panel de voz siguen acoplados en `servers/[slug]/+page.svelte`, pendiente extraer a componentes
- **Push notifications del SO** (tab cerrada): requiere Service Worker + VAPID + gestión de subscripciones en backend
- **Rail badges de servidor en tiempo real**: no se actualizan al recibir mensajes en otro servidor sin recargar (falta evento socket a nivel de servidor)
- **Invite links**: falta endpoint `POST/GET /servers/:slug/invite` y UI asociada
- Verificar que las vars de Cloudinary estén correctamente configuradas en Render (producción)

---

## Cómo usar este archivo

Al completar un objetivo, moverlo de "Pendiente" a "Completado" con una línea breve. Al surgir un objetivo nuevo, añadirlo a "Pendiente / backlog" con contexto mínimo (qué y por qué).
