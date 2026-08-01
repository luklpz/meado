# Log — Meado

Registro cronológico de cambios. Cada entrada nueva va arriba. Formato:

```
## YYYY-MM-DD — Título breve

- **Archivo(s):** ruta(s) tocada(s)
- **Qué:** qué cambió
- **Por qué:** motivo
- **Despliegue:** pendiente | subido
```

---

## Archivos desincronizados (local vs producción)

Tabla viva — actualizar cada vez que se despliega o se detecta drift.

| Archivo | Estado local | Estado producción | Notas |
|---|---|---|---|
| `apps/frontend/src/lib/livekit.ts` | commiteado | versión anterior (reconnectPolicy `as any`) | pendiente de deploy a Vercel |
| `apps/frontend/*` (adapter, wrangler.jsonc, proxy `/api`) | commiteado, verificado local (`wrangler dev`) | sigue en Vercel con adapter-auto | falta: crear proyecto Cloudflare, env vars, cutover DNS `meado.es` |
| `apps/backend-workers/*` (fase 3: REST + Durable Objects) | commiteado, verificado local (`wrangler dev` + WS reales + Supabase real) | no existe en producción | backend real sigue siendo `apps/backend` en Render — `apps/backend-workers` es build-en-paralelo, no reemplaza nada hasta fase 6 |

---

## Entradas

## 2026-08-01 — Fase 3: Durable Objects (gateway realtime), verificado con WebSockets reales

- **Archivo(s):** `apps/backend-workers/src/durable-objects/{channel-do,dm-do,user-registry-do}.ts` (nuevos), `src/lib/{ws-protocol,messages,dm-messages}.ts` (nuevos), `src/routes/ws.ts` (nuevo), `src/lib/broadcast.ts` (implementación real, ya no stubs), `src/routes/{channels,dm,friends,servers}.ts` (refactor para reusar las libs compartidas + presencia real + endpoint `voice-state`), `src/env.ts` + `wrangler.jsonc` (bindings de los 3 DOs + migración `new_sqlite_classes`), `src/index.ts` (exporta las clases DO, monta `/ws`, excluye `/ws/*` de CORS/headers)
- **Qué:** Redistribución completa de `messages.gateway.ts` (439 líneas) en 3 Durable Objects: `ChannelDO` (uno por canal, texto o voz), `DmDO` (uno por conversación), `UserRegistryDO` (**uno por usuario** — desviación deliberada del plan original que sugería 4-8 shards por hash; un DO por usuario es más simple y sin colisión entre usuarios no relacionados, y es el patrón que Cloudflare recomienda para esto). Modelo de conexión implementado tal cual se acordó: `channel:join`/`channel:leave`/`dm:join`/`dm:leave`/`voice:leave` **desaparecen como mensajes** — abrir el WebSocket es el join, cerrarlo es el leave (simplificación real que habilita el modelo "un WS por sala", no estaba en el diseño original de Socket.io). El roster de voz se deriva siempre de `state.getWebSockets()`, nunca de un Map propio, para no desincronizarse si el DO hiberna. El invariante de una sola sala de voz activa se implementa como handshake de 2 DOs: `ChannelDO.fetch()` llama a `UserRegistryDO.setActiveVoiceChannel()` (que devuelve el canal anterior) antes de aceptar la conexión, y si había uno distinto, hace RPC a `evictUser()` en el DO del canal viejo — que cierra esa conexión y deja que su propio `webSocketClose` haga el broadcast y el compare-and-clear del puntero (evita duplicar el broadcast y evita que un cierre tardío borre un puntero ya actualizado a la sala nueva). Rate limits (mensaje/reacción/voz) viven en `UserRegistryDO` como RPC (`checkRateLimit`), reutilizados igual por canal y DM (mismo cupo compartido que hoy). `server:subscribe` (bulk voice-occupancy) se sustituyó por un endpoint REST nuevo `GET /servers/:slug/voice-state` que pregunta a cada `ChannelDO` de voz por RPC (patrón N+1 aceptado a esta escala, según el plan). Lógica de mensajes/reacciones extraída a `lib/messages.ts`/`lib/dm-messages.ts` para que la compartan REST y DO (antes duplicada).
- **Verificación real:** `tsc --noEmit` limpio. Sesión completa con `wrangler dev` + WebSockets nativos reales (script Node, sin mocks) contra la cuenta de prueba y el servidor `servidor-prueba` (unión y salida explícitas para restaurar el estado, confirmado `isMember:false`/`_count.members:1` al final): conexión de sesión, dos conexiones simultáneas al mismo canal de texto (mismo usuario, dos pestañas simuladas) — `message:send` llega a ambas conexiones, `typing:start`/`typing:stop` excluye correctamente al emisor, rate limit de mensajes descarta silenciosamente el segundo envío inmediato (confirmado count=1 no 2), conexión a canal de voz recibe `voice:state` con el roster real, y el endpoint REST `/voice-state` nuevo coincide con ese roster.
- **Bug encontrado y corregido durante la propia verificación**: `typing:stop` no excluía al emisor de su propio broadcast (sí lo hacía el original vía `client.to()`) — se detectó porque el test mostraba eco a quien paraba de escribir. Corregido en `ChannelDO` y `DmDO` pasando la conexión de origen a `wsBroadcast(..., exclude)`.
- **Pendiente / no probado en esta sesión**: la expulsión cruzada entre dos salas de voz *distintas* (el invariante duro en sí) no se probó en vivo — hacía falta un segundo canal de voz al que la cuenta de prueba tuviera acceso, y no se creó infraestructura nueva para no tocar más datos reales sin necesidad. El diseño se razonó con cuidado (compare-and-clear, sin doble broadcast) pero queda como verificación pendiente explícita para la fase 5. Tampoco se probó el fan-out de presencia a amigos (la cuenta de prueba no tiene amigos) ni DMs en vivo (para no crear una conversación real con otro usuario sin avisar).
- **Por qué:** cierra la fase 3 del plan — la pieza de mayor riesgo de toda la migración.
- **Despliegue:** N/A

## 2026-08-01 — Fase 2 completa: channels, dm, friends, users portados a Hono

- **Archivo(s):** `apps/backend-workers/src/routes/{channels,dm,friends,users}.ts`, `src/lib/{friends,broadcast}.ts` (broadcast ampliado con `notifyUser`/`getOnlineUserIds`), `src/index.ts` (montaje de rutas)
- **Qué:** Puerto completo de `messages.controller/service` (mensajes de canal, lectura, LiveKit token), `dm.controller/service` (conversaciones, mensajes, añadir miembro — solo amigos), `friends.controller/service` (solicitudes, aceptar, alias, bloqueo) y `users.controller` (búsqueda, perfil público con amigos/servidores mutuos, reportes). El puente REST→Durable Object (`broadcastMessageCreated`, `broadcastDmMessageCreated`, etc.) queda en `lib/broadcast.ts` como no-ops explícitos hasta la fase 3 — los call sites ya están cableados, solo falta la implementación real. `gateway.onlineUsers` (presencia para `GET /friends`) también stub (`getOnlineUserIds` devuelve vacío) hasta que exista `UserRegistryDO`.
- **Verificación real:** `tsc --noEmit` limpio. `wrangler dev` contra Supabase real, todo de solo lectura (sin mutar datos): `GET /friends` y `/friends/pending` vacíos (correcto, la cuenta de prueba no tiene amigos), `GET /users/search?q=lu` devuelve usuarios reales, `GET /users/:id/profile` con un id real devuelve friendshipStatus/mutuals correctos, `GET /dm` vacío (correcto), `GET /channels/:id/messages` sin ser miembro → 403 correcto.
- **Pendiente:** escrituras (enviar mensaje, request de amistad, crear DM) sin probar en caliente todavía — fase 5. Presencia (`online: true/false` en `/friends`) siempre `false` hasta fase 3.
- **Por qué:** cierra la fase 2 del plan — toda la superficie REST portada a Hono.
- **Despliegue:** N/A

## 2026-08-01 — Fase 2 (parcial): módulos servers, upload, drive portados a Hono

- **Archivo(s):** `apps/backend-workers/src/routes/{servers,upload,drive}.ts`, `src/lib/{google-auth,drive,storage}.ts`, `src/lib/cloudinary.ts` (extendido: delete + upload genérico), `src/shared/permissions.ts` (copia), `src/index.ts` (montaje de rutas + `onError` global con `HTTPException`)
- **Qué:** Puerto completo de `servers.controller.ts`+`servers.service.ts` (CRUD servidor, icono, membership, bans, canales, whitelist, roles, LiveKit token, unread) y de `upload`/`drive` controllers. `googleapis` reemplazado por flujo OAuth2 refresh-token plano vía `fetch` (más simple de lo previsto en el plan — no hace falta JWT de service account, la app ya usaba refresh_token). Nonce de confirmación de subida a Drive: el original lo guardaba en un `Set` en memoria de un proceso único; en Workers no hay proceso único garantizado (dos isolates distintos pueden atender init-upload y confirm), así que se sustituyó por un JWT firmado de 2h — pierde la garantía de "uso único" pero mantiene la de "emitido legítimamente", que es equivalente a lo que el diseño original garantizaba en la práctica (el nonce tampoco estaba atado a un `fileId` concreto). `cloudinary.api.ping()` del endpoint `/upload/ping` se simplificó a solo devolver config (no hace ping real) — endpoint de debug, bajo riesgo.
- **Verificación real:** `tsc --noEmit` limpio. `wrangler dev` contra Supabase real: `GET /servers` lista los 2 servidores reales correctamente (`isMember` calculado bien), `GET /servers/servidor-prueba` devuelve canales/roles reales, `GET /servers/servidor-prueba/roles` → 403 correcto (no soy miembro), `GET /servers/los-reales/members` → 403 correcto, slug inexistente → 404. Comportamiento idéntico al backend NestJS actual en cada caso.
- **Pendiente:** operaciones de escritura (join/leave/crear canal/rol/ban) no probadas todavía en caliente — se dejan para la fase 5 (verificación end-to-end), evitar mutar datos reales sin necesidad ahora.
- **Por qué:** continuación mecánica de la fase 2 del plan — mismo patrón que el módulo auth de la fase 1.
- **Despliegue:** N/A (build en paralelo, no reemplaza producción hasta fase 6)

## 2026-08-01 — Fase 1: scaffold backend Workers + módulo auth completo, verificado contra Supabase real

- **Archivo(s):** `apps/backend-workers/` (proyecto nuevo completo: `package.json`, `wrangler.jsonc`, `tsconfig.json`, `prisma/schema.prisma` copiado, `prisma.config.ts`, `src/index.ts`, `src/env.ts`, `src/hono-env.ts`, `src/lib/{db,jwt,password,cloudinary,email}.ts`, `src/middleware/auth.ts`, `src/routes/auth.ts`, `src/types/disposable-email-domains.d.ts`, `.gitignore`)
- **Qué:** Primer slice vertical del plan de migración (`C:\Users\luka\.claude\plans\wiggly-swinging-tulip.md`). Hono como framework HTTP. `jose` reemplaza `jsonwebtoken` (4 tipos de token: login/socket/verify/reset, mismos claims). `bcryptjs` reemplaza `bcrypt`. Cloudinary: SDK Node reemplazado por subida firmada vía `fetch` + SHA-1 (WebCrypto) contra la API REST — el SDK usa `upload_stream` (Node streams), no se asumió compatible con Workers. `disposable-email-domains` requiere un `.d.ts` ambient propio (sin tipos publicados). DB: `pg.Pool` conecta directo a `env.DATABASE_URL` (fase 1, sin Hyperdrive todavía — Hyperdrive requiere `wrangler login`/cuenta Cloudflare, se añade en fase 6 cambiando una línea en `lib/db.ts`). Prisma schema duplicado desde `apps/backend/prisma/schema.prisma` (migraciones siguen viviendo solo ahí, este proyecto no migra, solo genera client).
- **Verificación real:** `tsc --noEmit` limpio. `wrangler dev` levanta el Worker contra Supabase de producción real (no mock). `bcryptjs` confirmado byte-compatible con `bcrypt` nativo (hash con uno, compara con el otro, caso positivo y negativo) sin tocar la DB. Con permiso explícito del usuario, se cambió la contraseña de la cuenta de prueba existente `losreales@meado.com` (username `TestAccount`) a una conocida y se probó el flujo completo real: `POST /auth/login` (200, `Set-Cookie` httpOnly/7d correcto) → `GET /auth/me` con esa cookie (200, incluye `socketToken` bien firmado) → `GET /auth/privacy`, `GET /auth/notifications`, `PATCH /auth/profile` (200 cada uno) → `POST /auth/logout` (limpia cookie) → `GET /auth/me` sin cookie (401). Efecto secundario de la prueba (`bio` de test) revertido a `null` después.
- **Hueco conocido, pendiente antes de fase 6:** rate limiting de estos endpoints (register/login/forgot/reset-password) no está portado — NestJS lo hacía con `@nestjs/throttler` en proceso, Workers no tiene ese equivalente en memoria. Se resolverá con el binding nativo de Rate Limiting de Cloudflare o reutilizando el patrón de `UserRegistryDO` de la fase 3.
- **Por qué:** fase 1 del plan aprobado — probar las piezas de infraestructura más arriesgadas (Hyperdrive/pg, jose, bcryptjs, patrón Hono) sobre el módulo más pequeño antes de portar el resto.
- **Despliegue:** N/A (proyecto nuevo, no se despliega hasta fase 6 — build en paralelo a `apps/backend`, que sigue siendo el backend real en producción)

## 2026-08-01 — Plan detallado: backend a Hono + Durable Objects

- **Archivo(s):** `objetivos.md`, `C:\Users\luka\.claude\plans\wiggly-swinging-tulip.md` (fuera del repo, plan de Claude Code)
- **Qué:** Diseño completo del backend nuevo tras investigación exhaustiva de `messages.gateway.ts` (439 líneas, Maps en memoria, rate limits, auth) y del uso de socket.io en el frontend. Decisiones cerradas: Hono como framework HTTP (NestJS no corre en Workers), Cloudflare Hyperdrive delante de Supabase (sin migrar de proveedor de DB), `jose` reemplaza `jsonwebtoken`, `bcryptjs` reemplaza `bcrypt` (mismo formato de hash, sin romper contraseñas de usuarios existentes), `googleapis` reemplazado por `fetch` + JWT firmado. Sharding de Durable Objects: `ChannelDO` (uno por canal), `DmDO` (uno por conversación), `UserRegistryDO` (sharded, presencia + rate limits globales + puntero de voz activa). Modelo de conexión frontend corregido tras pregunta del usuario: no es "un WS por sala" puro — es 1 socket de sesión (presencia, friend requests, previews/badges de *todas* las DMs) + 1 socket por sala realmente abierta en pantalla; si no se separa así, el modelo ingenuo abriría una conexión por cada DM del usuario (crece con nº de conversaciones, no con lo que hay en pantalla). Fuera de alcance: juego espacial 2D/Phaser (confirmado sin handler en el backend actual, no funcional).
- **Por qué:** Socket.io no corre en Cloudflare Workers (no hay proceso Node persistente) — migrar el backend no es un cambio de host, es una reescritura de la capa realtime. Se investigó a fondo antes de escribir código dado el riesgo (real-time reliability es prioridad no negociable del proyecto) y que hay usuarios reales con hashes bcrypt en producción.
- **Despliegue:** N/A (solo planificación)

## 2026-08-01 — Frontend: código migrado a Cloudflare Workers (sin desplegar aún)

- **Archivo(s):** `apps/frontend/package.json`, `apps/frontend/svelte.config.js`, `apps/frontend/wrangler.jsonc` (nuevo), `apps/frontend/src/routes/api/[...path]/+server.ts` (nuevo), `apps/frontend/vercel.json` (eliminado)
- **Qué:** `adapter-auto` → `@sveltejs/adapter-cloudflare`. Añadido `wrangler.jsonc` (Worker + static assets desde `.svelte-kit/cloudflare`, `compatibility_flags: nodejs_compat`). El rewrite `/api/:path*` de `vercel.json` se reemplazó por una ruta catch-all de SvelteKit (`api/[...path]/+server.ts`) que hace proxy genérico (método, headers, body streamed con `duplex: half`, cookies) hacia `BACKEND_URL` — decisión deliberada en vez de `_redirects` porque el proxy transparente (status 200) de Cloudflare Pages no está confirmado en el runtime unificado de Workers assets. Scripts nuevos `cf:dev` / `cf:deploy` con wrangler.
- **Verificación real:** `npm run build` compila OK con el nuevo adapter. `wrangler dev` levanta el Worker localmente; `GET /login` → 200. Con el backend NestJS corriendo en local (`npm run start:dev`), `GET /api/auth/me` a través del proxy del Worker devolvió el mismo body/status (401 Unauthorized) que pegarle directo al backend — proxy end-to-end confirmado, no solo razonado sobre el código.
- **Por qué:** primer paso del plan de migración a Cloudflare (frontend, más simple que el backend).
- **Pendiente:** no se ha probado el flujo de login completo (forward de `Set-Cookie` en una respuesta 2xx) para no crear cuentas de prueba en la DB de producción sin permiso. Falta crear el proyecto en Cloudflare, configurar env vars y cortar DNS — el sitio en producción sigue sirviéndose desde Vercel.
- **Despliegue:** pendiente

## 2026-08-01 — Plan: migración completa a Cloudflare (frontend + backend)

- **Archivo(s):** `objetivos.md`
- **Qué:** Añadida sección "En progreso" con plan de migración Vercel→Cloudflare Pages y Render→Cloudflare Workers/Durable Objects. Sustituiría también el Redis de Fase 2 del roadmap (Durable Objects reemplaza Maps en memoria de `MessagesGateway`).
- **Por qué:** unificar frontend+backend en una plataforma, evitar sleep de Render free tier.
- **Despliegue:** N/A (solo planificación, sin código aún)

## 2026-08-01 — LiveKit: reconnectPolicy tipada correctamente

- **Archivo(s):** `apps/frontend/src/lib/livekit.ts`
- **Qué:** `reconnectPolicy` pasa de objeto plano forzado con `as any` (`{ maxRetries, minReconnectWait, maxReconnectWait }`, shape no soportado por el SDK) a `new DefaultReconnectPolicy([1000, 2000, 3000, 4000, 5000])`, clase real exportada por `livekit-client` que implementa `ReconnectPolicy`. 5 reintentos con backoff creciente en ms.
- **Por qué:** el objeto anterior no era el shape real esperado por el SDK — probablemente ignorado o roto en runtime, enmascarado por `as any`. Con `DefaultReconnectPolicy` la reconexión usa la política real soportada, sin type-cast falso.
- **Despliegue:** pendiente (Vercel)

## 2026-08-01 — Metodología de trabajo: log.md + rename documentación

- **Archivo(s):** `documentacion.md` (renombrado desde `DOCUMENTACIÓN.md`), `log.md` (nuevo), `objetivos.md`
- **Qué:** Renombrado `DOCUMENTACIÓN.md` → `documentacion.md` (referencias internas actualizadas). Creado `log.md` como registro cronológico + tabla de archivos desincronizados.
- **Por qué:** Adopción de metodología de 3 documentos vivos (log/objetivos/documentacion) para persistencia de contexto entre sesiones, acordada con el usuario.
- **Despliegue:** pendiente (solo documentación, no afecta build)
