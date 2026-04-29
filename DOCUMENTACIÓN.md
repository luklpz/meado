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
8. [Comunicación en tiempo real](#8-comunicación-en-tiempo-real)
9. [Motor gráfico — Phaser](#9-motor-gráfico--phaser)
10. [Audio y vídeo — LiveKit](#10-audio-y-vídeo--livekit)
11. [Entorno de desarrollo](#11-entorno-de-desarrollo)
12. [Infraestructura y despliegue](#12-infraestructura-y-despliegue)
13. [Variables de entorno](#13-variables-de-entorno)
14. [Convenciones y decisiones de diseño](#14-convenciones-y-decisiones-de-diseño)

---

## 1. ¿Qué es Meado?

Meado es una **plataforma social espacial 2D**. Los usuarios se representan como avatares que se mueven libremente por un mapa top-down (vista cenital) que puede representar cualquier espacio real: una oficina, un hogar, un espacio de eventos.

La comunicación entre usuarios es **basada en proximidad**: el audio y el vídeo solo se activan cuando dos avatares se encuentran dentro de un radio R configurable por sala. El volumen escala de forma continua con la distancia — cuanto más cerca, más fuerte; fuera del radio, silencio total.

---

## 2. Concepto y diferencial

La mayoría de las herramientas de comunicación digital (Zoom, Slack, Discord) son planas: todos escuchan a todos o nadie escucha a nadie. Meado propone un modelo distinto: **la comunicación ocurre de forma orgánica según la posición**.

Esto replica dinámicas del mundo físico que herramientas convencionales destruyen:
- Conversaciones espontáneas al cruzarte con alguien.
- Grupos que se forman y disuelven de forma natural.
- La posibilidad de estar presente sin estar obligado a participar.

La fórmula de volumen es simple e intuitiva:

```
volumen = clamp(1 − distancia / R, 0, 1)
```

A distancia 0 el volumen es máximo (1). Al alcanzar el radio R el volumen es 0. Entre medias, la escala es lineal.

---

## 3. Objetivos y fases de crecimiento

El proyecto está diseñado para crecer. Cada decisión arquitectónica contempla las tres fases siguientes sin necesidad de reescrituras:

| Fase | Usuarios | Sincronización de posiciones | Modelo de medios |
|------|----------|------------------------------|-----------------|
| **1 — Actual** | ≤ 20 | Socket.io + Map en memoria | LiveKit SFU externo |
| **2 — Futuro próximo** | ≤ 1.000 | Socket.io + Redis pub/sub | LiveKit con gestión dinámica de salas |
| **3 — Escala** | ≥ 10.000 | WebTransport + Redis cluster | LiveKit cluster o Mesh fallback |

**Fase 1** es el objetivo actual: uso personal, hasta 20 usuarios simultáneos, audio/vídeo HD sin cortes, latencia de sincronización de avatares por debajo de 100 ms, carga mínima de CPU en el navegador.

---

## 4. Stack tecnológico

### Frontend

| Tecnología | Rol | Por qué |
|-----------|-----|---------|
| **SvelteKit 5** | Framework de aplicación | Compilador que elimina el runtime de JavaScript: menos KB al cliente, mejor rendimiento. La reactividad es nativa del lenguaje, no de una librería. |
| **Vite 8** | Bundler y servidor de desarrollo | HMR instantáneo, build muy rápido. Base oficial de SvelteKit. |
| **Phaser 4** | Motor de videojuego 2D (canvas) | Gestión del loop de juego, input de teclado, renderizado de avatares y mapa. Utilizado solo en cliente (importación dinámica para evitar fallos SSR). |
| **socket.io-client** | Comunicación en tiempo real | Librería cliente que se conecta al Gateway WebSocket del backend. |

### Backend

| Tecnología | Rol | Por qué |
|-----------|-----|---------|
| **NestJS 11** | Framework de servidor | Arquitectura modular con decoradores. Integración nativa con WebSockets (Socket.io) y sistema de inyección de dependencias que facilita el testing y la escalabilidad. |
| **Socket.io 4** | Servidor WebSocket | Protocolo sobre WebSocket con fallback a long-polling. Salas integradas (rooms), broadcast eficiente. |
| **Prisma 7** | ORM | Type-safety completo desde esquema hasta consulta. Migrations declarativas. El cliente generado se tipado fuertemente con TypeScript. |
| **PostgreSQL** | Base de datos relacional | Almacenamiento persistente de usuarios, salas y membresías. |

### Infraestructura

| Tecnología | Rol | Por qué |
|-----------|-----|---------|
| **Supabase** | Base de datos gestionada (PostgreSQL) | Postgres en la nube sin gestionar servidores. Session Pooler compatible con las migrations de Prisma. |
| **LiveKit** | SFU (Selective Forwarding Unit) para medios | Infraestructura de audio/vídeo en tiempo real de baja latencia. La lógica de proximidad corre en el cliente, el backend nunca procesa medios. |
| **Railway** | Hosting del backend | Plataforma PaaS simple con deploys automáticos desde GitHub. Soporta Node.js sin configuración de servidor. |
| **Vercel** | Hosting del frontend | Plataforma de despliegue nativa para SvelteKit/Next.js. CDN global, HTTPS automático, deploys por push a GitHub. |

---

## 5. Arquitectura del sistema

```
┌─────────────────────────────────────────────────────────┐
│                     NAVEGADOR (Cliente)                  │
│                                                          │
│  ┌─────────────────────┐   ┌────────────────────────┐   │
│  │   SvelteKit (UI)    │   │   Phaser 4 (Canvas)    │   │
│  │  +page.svelte       │──▶│   GameScene.ts         │   │
│  │  PhaserGame.svelte  │   │   Avatares + Mapa      │   │
│  └──────────┬──────────┘   └──────────┬─────────────┘   │
│             │                         │                  │
│             └──────────┬──────────────┘                  │
│                        │ socket.io-client                │
│                        │ VITE_BACKEND_URL                │
└────────────────────────┼────────────────────────────────┘
                         │ WebSocket (Socket.io)
                         ▼
┌─────────────────────────────────────────────────────────┐
│                  BACKEND (NestJS — Railway)              │
│                                                          │
│  ┌──────────────────┐   ┌──────────────────────────┐    │
│  │  RoomsGateway    │   │      RoomsService        │    │
│  │  @WebSocket      │──▶│  Map<socketId, Player>   │    │
│  │  room:join       │   │  (Redis en Phase 2)      │    │
│  │  player:move     │   └──────────────────────────┘    │
│  └──────────────────┘                                    │
│                                                          │
│  ┌──────────────────┐                                    │
│  │  PrismaService   │──▶  Supabase PostgreSQL            │
│  │  (global)        │     Users / Rooms / Members        │
│  └──────────────────┘                                    │
└─────────────────────────────────────────────────────────┘
                         │
                         │ (futuro)
                         ▼
┌─────────────────────────────────────────────────────────┐
│              LiveKit SFU (externo)                       │
│  Audio y vídeo de proximidad                            │
│  Lógica de distancia: solo en cliente                   │
└─────────────────────────────────────────────────────────┘
```

El backend **nunca procesa medios**. Solo sincroniza posiciones. La decisión de activar o silenciar audio/vídeo es exclusivamente del cliente, que calcula distancias frame a frame en Phaser.

---

## 6. Estructura del repositorio

El proyecto es un **monorepo** con dos aplicaciones independientes, cada una con su propio `node_modules` y ciclo de build:

```
meado/
├── apps/
│   ├── frontend/                  # SvelteKit + Phaser
│   │   ├── src/
│   │   │   ├── lib/
│   │   │   │   ├── socket.ts          # Svelte store: conexión Socket.io
│   │   │   │   ├── types/             # Tipos Socket.io (espejo del backend)
│   │   │   │   └── game/
│   │   │   │       ├── GameScene.ts   # Escena Phaser (factory function)
│   │   │   │       └── PhaserGame.svelte
│   │   │   └── routes/
│   │   │       └── +page.svelte       # Página principal del juego
│   │   ├── svelte.config.js
│   │   └── package.json
│   │
│   └── backend/                   # NestJS + Socket.io + Prisma
│       ├── src/
│       │   ├── main.ts                # Punto de entrada
│       │   ├── app.module.ts
│       │   ├── prisma/
│       │   │   ├── prisma.module.ts   # PrismaModule (global)
│       │   │   └── prisma.service.ts  # Extiende PrismaClient
│       │   ├── rooms/
│       │   │   ├── rooms.gateway.ts   # WebSocket Gateway
│       │   │   ├── rooms.service.ts   # Estado en memoria (Map)
│       │   │   └── rooms.module.ts
│       │   └── shared/types/
│       │       └── socket-events.types.ts  # Contratos de eventos
│       ├── prisma/
│       │   └── schema.prisma          # Modelos de base de datos
│       ├── prisma.config.ts           # URL de Prisma (fuera de schema)
│       ├── railway.toml               # Configuración de deploy
│       └── package.json
│
├── CLAUDE.md                      # Instrucciones para Claude Code
└── DOCUMENTACIÓN.md               # Este archivo
```

---

## 7. Base de datos

### Modelos

**User** — representa a un usuario registrado:
- `id`: identificador único (CUID)
- `username`: nombre de usuario único
- `avatar`: identificador del sprite del avatar
- `lastPos`: última posición conocida (JSON `{x, y, roomId}`)

**Room** — representa una sala/espacio:
- `id`: identificador único (CUID)
- `name`: nombre visible de la sala
- `slug`: identificador de URL único

**RoomMember** — relación muchos-a-muchos entre usuarios y salas:
- Clave compuesta `[userId, roomId]`
- `joinedAt`: fecha de incorporación

### Configuración Prisma 7

Prisma 7 introduce un cambio importante: la URL de la base de datos ya no vive en `schema.prisma` sino en un archivo separado `prisma.config.ts`. El cliente generado se emite a `generated/prisma/` (ignorado por git) y se regenera en cada build con `prisma generate`.

La conexión usa `@prisma/adapter-pg` de forma explícita — requerido por Prisma 7 para la conexión a PostgreSQL.

### Base de datos en producción

Se utiliza **Supabase** como proveedor de PostgreSQL gestionado. Punto importante: se debe usar el **Session Pooler** (puerto 5432), no el Transaction Pooler (puerto 6543). El Transaction Pooler usa PgBouncer en modo transacción, que es incompatible con las migrations de Prisma al no soportar sentencias DDL arbitrarias.

---

## 8. Comunicación en tiempo real

### Contrato de eventos Socket.io

Los tipos de todos los eventos están definidos en dos archivos **espejo** que deben mantenerse sincronizados manualmente:

- `apps/backend/src/shared/types/socket-events.types.ts`
- `apps/frontend/src/lib/types/socket-events.types.ts`

#### Eventos cliente → servidor

| Evento | Payload | Descripción |
|--------|---------|-------------|
| `room:join` | `{ roomId, username }` | El cliente solicita entrar en una sala |
| `player:move` | `{ x, y, roomId }` | El cliente envía su nueva posición |

#### Eventos servidor → cliente

| Evento | Payload | Descripción |
|--------|---------|-------------|
| `room:state` | `{ players[] }` | Snapshot completo de la sala al conectarse |
| `player:joined` | `PlayerState` | Otro jugador ha entrado en la sala |
| `player:moved` | `PlayerState` | Un jugador ha actualizado su posición |
| `player:left` | `{ playerId }` | Un jugador ha abandonado la sala |

### Throttling de posición

Las actualizaciones de posición se emiten a **20 Hz** (cada 50 ms). El throttle se implementa con una comprobación de timestamp dentro del loop `update()` de Phaser — nunca con `setInterval`, que corre fuera del loop de juego y causa deriva temporal.

### Interpolación de avatares remotos

Los avatares remotos no se teletransportan a la posición recibida: se **interpolan** hacia ella cada frame mediante decaimiento exponencial:

```
alpha = 1 − lerpStiffness ^ deltaTime
posición = posiciónActual + (posiciónObjetivo − posiciónActual) × alpha
```

Esto desacopla la suavidad visual de la tasa de emisión (20 Hz) y tolera jitter de red sin efecto de goma elástica.

### Escalabilidad del estado en memoria

`RoomsService` almacena las posiciones en un `Map<socketId, PlayerState>`. Esta es la implementación de Fase 1. Para Fase 2, se sustituirá por Redis pub/sub sin modificar el Gateway ni el contrato de eventos — el contrato es estable por diseño.

---

## 9. Motor gráfico — Phaser

Phaser 4 gestiona el canvas 2D: input de teclado (WASD / flechas), renderizado de avatares, loop de juego y cálculo de distancias para la proximidad.

### Importación dinámica

Phaser se importa **siempre de forma dinámica** dentro de `onMount`:

```javascript
const [Phaser, { createGameScene }] = await Promise.all([
  import('phaser'),
  import('./GameScene.js')
]);
```

Esto es necesario porque SvelteKit ejecuta código en servidor durante el build (SSR). Phaser usa APIs de navegador (`window`, `document`, `canvas`) que no existen en Node.js. La importación dinámica dentro de `onMount` garantiza que Phaser solo se carga en el cliente.

### Factory function

`GameScene.ts` exporta una función `createGameScene(Phaser, socket, config)` en lugar de una clase directamente. Esto es necesario porque la clase Phaser.Scene debe definirse a nivel de módulo (no dentro de un callback), pero necesita acceso al socket y la configuración que solo están disponibles en tiempo de ejecución.

---

## 10. Audio y vídeo — LiveKit

LiveKit actúa como **SFU** (Selective Forwarding Unit): un servidor especializado que recibe los streams de medios de cada usuario y los reenvía selectivamente, sin decodificar ni procesar el contenido. Esto es lo que permite audio y vídeo HD con latencia baja y carga de servidor mínima.

### Estado actual

LiveKit **aún no está integrado** en el código. Está planificado como siguiente hito tras el despliegue.

### Diseño previsto

- La lógica de proximidad correrá completamente en el cliente.
- Phaser calcula cada frame la distancia entre el avatar local y cada avatar remoto.
- Si la distancia es menor que R, el SDK de LiveKit activa el track de audio/vídeo del participante y ajusta el volumen.
- Si la distancia supera R, el track se pausa.
- El backend nunca recibe ni procesa medios.

---

## 11. Entorno de desarrollo

### Requisitos previos

- Node.js 20+
- npm 10+
- Acceso a la base de datos PostgreSQL (Supabase)

### Arrancar el proyecto en local

**Terminal 1 — Backend:**
```bash
cd apps/backend
npm install
npm run start:dev        # localhost:3000
```

**Terminal 2 — Frontend:**
```bash
cd apps/frontend
npm install
npm run dev              # localhost:5173
```

### Comandos útiles

**Backend:**
```bash
npm run build            # Compilar a dist/ (incluye prisma generate)
npm run test             # Tests unitarios Jest
npx prisma generate      # Regenerar cliente Prisma tras cambios en schema
npx prisma migrate dev   # Crear y aplicar una nueva migración
npx prisma studio        # Explorador visual de la base de datos
```

**Frontend:**
```bash
npm run build            # Build de producción
npm run check            # Type check con svelte-check
npm run lint             # Prettier + ESLint
npm run format           # Prettier (escritura)
```

---

## 12. Infraestructura y despliegue

### Pipeline de despliegue

Ambas plataformas están conectadas al repositorio de GitHub. Cualquier push a la rama `main` dispara un redeploy automático en 1-2 minutos.

```
git push origin main
       │
       ├──▶  Vercel  →  Build SvelteKit  →  apps/frontend en producción
       │
       └──▶  Railway →  prisma generate + nest build  →  apps/backend en producción
```

### Backend — Railway

- **Root directory:** `apps/backend`
- **Build command:** `npm run build` (ejecuta `prisma generate && nest build`)
- **Start command:** `npm run start:prod` (`node dist/main`)
- **Configuración:** `apps/backend/railway.toml`

### Frontend — Vercel

- **Root directory:** `apps/frontend`
- **Framework:** SvelteKit (detección automática)
- **Adapter:** `@sveltejs/adapter-auto` (detecta Vercel automáticamente)

---

## 13. Variables de entorno

### Backend (`apps/backend/.env` — no se sube a git)

| Variable | Descripción | Ejemplo |
|----------|-------------|---------|
| `DATABASE_URL` | Connection string de Supabase (Session Pooler, puerto 5432) | `postgresql://postgres:...@aws-0-eu-west-1.pooler.supabase.com:5432/postgres` |
| `CORS_ORIGIN` | Origen(es) permitidos, separados por coma | `https://meado.vercel.app` |
| `PORT` | Puerto en el que escucha el servidor | `3000` |

### Frontend (`apps/frontend/.env` — no se sube a git)

| Variable | Descripción | Ejemplo |
|----------|-------------|---------|
| `VITE_BACKEND_URL` | URL del backend NestJS | `https://meado-backend.up.railway.app` |

> Las variables `VITE_*` se incrustan en el bundle en tiempo de build. No incluir secretos con este prefijo.

---

## 14. Convenciones y decisiones de diseño

### Tipos de Socket.io en espejo

Los contratos de eventos están duplicados en frontend y backend. Esto es intencional: los dos apps son independientes y no existe aún un paquete compartido. Al modificar un evento, ambos archivos deben actualizarse manualmente.

### Prisma: proveedor `prisma-client-js`

Se usa el proveedor `"prisma-client-js"` (no `"prisma-client"`). El proveedor `"prisma-client"` genera un cliente TypeScript con `import.meta.url` que Node.js carga como ESM, incompatible con el sistema de módulos CommonJS de NestJS.

### NestJS: `deleteOutDir: false`

En `nest-cli.json` se desactiva `deleteOutDir`. Con esta opción activa, NestJS borra `dist/` y luego intenta ejecutar `node dist/main` antes de que TypeScript haya terminado de compilar, causando un error de arranque intermitente.

### Phaser: throttle dentro del loop de juego

El throttle de posición (20 Hz) se implementa comparando timestamps dentro del método `update()` de Phaser, no con `setInterval`. `setInterval` corre en un hilo diferente al loop de animación y puede causar deriva temporal cuando la pestaña del navegador pierde foco.

### `module: "commonjs"` en tsconfig

El `tsconfig.json` del backend usa `module: "commonjs"` y excluye `prisma.config.ts` del árbol de compilación de TypeScript. Esto se debe a que `prisma.config.ts` lo ejecuta directamente la CLI de Prisma usando `tsx`, no el compilador de TypeScript del proyecto.

---

*Documento actualizado: abril 2026*
