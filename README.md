# Meado

Plataforma de comunicación social híbrida. Combina la experiencia de herramientas tipo Discord (servidores con canales de texto y voz, mensajes directos, lista de amigos) con un modo espacial 2D donde los avatares se mueven por un mapa y el audio funciona por proximidad.

> **Estado del proyecto:** Las funciones de comunicación estándar (servidores, canales, DMs, amigos, voz) están operativas en producción (`meado.es`, sobre Cloudflare Workers). El modo espacial 2D existe como opción de servidor y tiene código de cliente (Phaser) en el repo, pero **no está conectado** — no es un "en desarrollo" activo, es una funcionalidad pausada (ver Características).

---

## Características

### Disponibles

- **Servidores** — crea o únete a servidores con canales de texto y voz. Acceso público, por contraseña o por lista blanca. Roles con permisos granulares por servidor.
- **Canales de texto** — mensajes en tiempo real, reacciones con emoji, archivos adjuntos, indicadores de escritura, seguimiento de mensajes leídos.
- **Canales de voz** — audio en tiempo real vía LiveKit. HUD de llamada persistente al navegar entre canales.
- **Mensajes directos** — DMs 1:1 y grupos con nombre. Mismas capacidades que los canales de texto.
- **Sistema de amigos** — solicitudes, presencia online en tiempo real, alias personalizados, bloqueos.
- **Perfiles** — avatar, nombre, bio, pronombres, color de banner, configuración de privacidad y notificaciones.
- **Archivos adjuntos** — Cloudinary para imágenes y archivos hasta 25 MB; Google Drive para archivos grandes (subida directa desde el cliente).
- **Notificaciones push** — notificaciones del navegador para DMs cuando la pestaña está en segundo plano.

### Pausado — código presente, sin conectar

- **Modo Spatial** — servidor de tipo 2D donde los avatares se moverían por un mapa top-down, con volumen por distancia (`volumen = clamp(1 − distancia / R, 0, 1)`). Se puede crear un servidor de este tipo, pero el cliente muestra un placeholder ("Mapa 2D no disponible todavía") en vez de conectar Phaser — el protocolo de movimiento nunca llegó a implementarse en ningún backend, ni el actual ni el anterior. Fuera de alcance explícito en la migración a Cloudflare.

---

## Stack

### Frontend
| Tecnología | Rol |
|---|---|
| SvelteKit 5 | Framework (SSR + cliente), adapter `@sveltejs/adapter-cloudflare` |
| Vite | Bundler y servidor de desarrollo |
| WebSocket nativo | Comunicación en tiempo real (wrapper propio con reconexión/backoff, `src/lib/socket.ts`) |
| LiveKit SDK | Cliente de audio/voz |
| Phaser *(sin conectar)* | Motor 2D del modo Spatial, presente pero código muerto — ver Características |

### Backend
| Tecnología | Rol |
|---|---|
| Hono | Framework HTTP sobre Cloudflare Workers |
| Durable Objects | Estado + WebSocket en tiempo real — `ChannelDO`, `DmDO`, `UserRegistryDO`, `RateLimiterDO` |
| Prisma 7 | ORM con type-safety y migraciones declarativas |
| PostgreSQL | Base de datos relacional, accedida vía Cloudflare Hyperdrive |
| jose + bcryptjs | Auth JWT y hash de contraseña, compatibles con el runtime de Workers (sin Passport) |

### Servicios externos
| Servicio | Uso |
|---|---|
| LiveKit | SFU para voz en canales (modo Spatial sin conectar en el frontend) |
| Cloudinary | Imágenes, avatares, adjuntos (≤ 25 MB) — subida firmada vía `fetch`, sin SDK Node |
| Google Drive | Adjuntos grandes — subida resumible vía `fetch` + OAuth2, sin `googleapis` |
| Resend | Emails transaccionales (verificación, recuperación de contraseña) |
| Cloudflare Hyperdrive | Pooling/cache delante de PostgreSQL (Supabase) |

---

## Arquitectura

```
CLIENTE
  SvelteKit (UI) ──────────────────────────────┐
  PhaserGame.svelte (placeholder, Spatial) ────┤
                                               │ WebSocket nativo
                                               │ wss://meado.es/ws/{channel,dm,session}
                                               ▼
WORKER meado-frontend (meado.es)
  SvelteKit SSR + proxy /api/* → BACKEND_URL
                                               │ HTTP /api/*, WS directo
                                               ▼
WORKER meado-backend (Hono)
  ┌──────────────────────────────────────────────────┐
  │  /ws/channel/:id → ChannelDO   (1 por canal)      │
  │  /ws/dm/:id      → DmDO        (1 por conversación)│
  │  /ws/session     → UserRegistryDO (1 por usuario)  │
  └──────────────────────────────────────────────────┘
  ┌──────────┐ ┌──────────┐ ┌─────────────┐
  │ /servers │ │ /friends │ │ /auth /users│
  └──────────┘ └──────────┘ └─────────────┘
  ┌─────────────────────────────────────────┐
  │  Hyperdrive → PostgreSQL (Supabase)     │
  └─────────────────────────────────────────┘
                         │
                         ▼
                   LiveKit SFU
```

Todas las llamadas HTTP del frontend usan rutas relativas `/api/...`. En desarrollo, Vite las proxifica al backend local. En producción, una ruta de SvelteKit (`src/routes/api/[...path]/+server.ts`) reenvía `/api/*` a `BACKEND_URL` — ambas apps corren como Workers de Cloudflare, no hay rewrite de host externo. Detalle completo en `documentacion.md`.

---

## Autenticación

JWT con cookies httpOnly (7 días). Sin Passport — implementado directamente con `jose` (firma/verificación, compatible con Workers) + `bcryptjs`.

- El registro crea una cuenta no verificada y envía un email de confirmación vía Resend.
- El login requiere email verificado. Devuelve también un `socketToken` (JWT de 1h) que el cliente pasa como `?token=` al conectar cualquiera de los tres WebSocket (`/ws/channel/:id`, `/ws/dm/:id`, `/ws/session`).
- Cada Durable Object verifica el `socketToken` de forma independiente al aceptar la conexión. Token inválido → rechazo inmediato. La identidad siempre proviene del JWT, nunca del payload del cliente.
- El primer usuario registrado es ADMIN automáticamente.

---

## Instalación

### Requisitos

- Node.js 20+
- PostgreSQL

### Backend

```bash
cd apps/backend-workers
cp .env.example .env        # completa las variables (DATABASE_URL, JWT_SECRET, etc.)
npm install
npx prisma migrate dev
npm run dev                  # wrangler dev, localhost:8787
```

### Frontend

```bash
cd apps/frontend
cp .env.example .env        # completa las variables
npm install
npm run dev                  # localhost:5173
```

Ver [`apps/frontend/.env.example`](apps/frontend/.env.example) para la lista completa de variables de frontend; backend no tiene `.env.example` todavía (ver `CLAUDE.md` para las variables necesarias).

Servicios necesarios: **PostgreSQL**, **LiveKit**, **Resend**, **Cloudinary**, **Cloudflare** (Workers + Hyperdrive). Google Drive es opcional.

---

## Comandos

```bash
# Backend (apps/backend-workers)
npm run dev               # wrangler dev, hot reload
npm run build              # prisma generate
npm run deploy              # build + wrangler deploy
npm run typecheck          # tsc --noEmit

# Frontend
npm run dev              # desarrollo
npm run build            # build de producción
npm run check            # type check (svelte-check)
npm run lint              # Prettier + ESLint

# Prisma (desde apps/backend-workers)
npx prisma migrate dev   # crear y aplicar migración
npx prisma studio        # explorador visual de la base de datos
```

---

## Despliegue

| App | Plataforma | Notas |
|---|---|---|
| Frontend | Cloudflare Workers | dominio propio `meado.es`, proxy `/api/*` a `BACKEND_URL` vía ruta SvelteKit |
| Backend | Cloudflare Workers | Durable Objects (WS realtime) + Hyperdrive delante de PostgreSQL |

---

## Hoja de ruta

| Fase | Usuarios objetivo | Sincronización |
|---|---|---|
| **1 — Actual** | ≤ 100 | Cloudflare Workers + Durable Objects (1 por canal/DM/usuario) |
| **2** | ≤ 1.000 | Sin plan cerrado — los Durable Objects ya resuelven el problema que iba a resolver Redis pub/sub (estado compartido sin depender de un único proceso) |
| **3** | ≥ 10.000 | Sin plan cerrado |

El roadmap original (Socket.io + Maps → Redis → WebTransport) se escribió para la arquitectura NestJS retirada en agosto 2026. Detalle completo en `documentacion.md`.

---

*Última actualización del README: 2026-08-02*
