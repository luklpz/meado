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

---

## Entradas

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
