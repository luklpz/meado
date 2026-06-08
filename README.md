# Meado

Plataforma de comunicación social híbrida. Combina la experiencia de herramientas tipo Discord (servidores con canales de texto y voz, mensajes directos, lista de amigos) con un modo espacial 2D donde los avatares se mueven por un mapa y el audio funciona por proximidad.

> **Estado del proyecto:** Las funciones de comunicación estándar (servidores, canales, DMs, amigos, voz) están operativas. El modo espacial 2D está actualmente **en desarrollo**.

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

### En desarrollo

- **Modo Spatial** — servidor de tipo 2D donde los avatares se mueven libremente por un mapa top-down. El volumen de cada participante varía según la distancia (`volumen = clamp(1 − distancia / R, 0, 1)`). Construido sobre Phaser y LiveKit.

---

## Stack

### Frontend
| Tecnología | Rol |
|---|---|
| SvelteKit 5 | Framework (SSR + cliente) |
| Vite | Bundler y servidor de desarrollo |
| socket.io-client | Comunicación en tiempo real |
| LiveKit SDK | Cliente de audio/voz |
| Phaser *(WIP)* | Motor 2D para el modo Spatial |

### Backend
| Tecnología | Rol |
|---|---|
| NestJS 11 | Framework de servidor |
| Socket.io 4 | WebSocket — un único Gateway gestiona todos los eventos |
| Prisma 7 | ORM con type-safety y migraciones declarativas |
| PostgreSQL | Base de datos relacional |
| jsonwebtoken + bcrypt | Auth JWT manual (sin Passport) |

### Servicios externos
| Servicio | Uso |
|---|---|
| LiveKit | SFU para voz en canales y modo Spatial |
| Cloudinary | Imágenes, avatares, adjuntos (≤ 25 MB) |
| Google Drive | Adjuntos grandes (subida directa vía URL firmada) |
| Resend | Emails transaccionales (verificación, recuperación de contraseña) |

---

## Arquitectura

```
CLIENTE
  SvelteKit (UI) ──────────────────────────────┐
  Phaser 2D (solo Spatial, WIP) ───────────────┤
                                               │ socket.io-client
                                               ▼
BACKEND (NestJS)
  ┌─────────────────────────────────────────┐
  │  MessagesGateway (WebSocket)            │
  │  canales · DMs · voz · typing           │
  │  reacciones · presencia · amigos        │
  └─────────────────────────────────────────┘
  ┌──────────┐ ┌──────────┐ ┌─────────────┐
  │ /servers │ │ /friends │ │ /auth /users│
  └──────────┘ └──────────┘ └─────────────┘
  ┌─────────────────────────────────────────┐
  │  PrismaService → PostgreSQL             │
  └─────────────────────────────────────────┘
                         │
                         ▼
                   LiveKit SFU
```

Todas las llamadas HTTP del frontend usan rutas relativas `/api/...`. En desarrollo, Vite las proxifica a `localhost:3000`. En producción, Vercel las reescribe al backend en Render.

---

## Autenticación

JWT con cookies httpOnly (7 días). Sin Passport — implementado directamente con `jsonwebtoken` + `bcrypt`.

- El registro crea una cuenta no verificada y envía un email de confirmación vía Resend.
- El login requiere email verificado. Devuelve también un `socketToken` (JWT de 1h) para autenticar la conexión WebSocket.
- El Gateway verifica el `socketToken` en cada conexión. Token inválido → desconexión inmediata. La identidad siempre proviene del JWT, nunca del payload del cliente.
- El primer usuario registrado es ADMIN automáticamente.

---

## Instalación

### Requisitos

- Node.js 20+
- PostgreSQL

### Backend

```bash
cd apps/backend
cp .env.example .env        # completa las variables
npm install
npx prisma migrate dev
npm run start:dev            # localhost:3000
```

### Frontend

```bash
cd apps/frontend
cp .env.example .env        # completa las variables
npm install
npm run dev                  # localhost:5173
```

Ver [`apps/backend/.env.example`](apps/backend/.env.example) y [`apps/frontend/.env.example`](apps/frontend/.env.example) para la lista completa de variables.

Servicios necesarios: **PostgreSQL**, **LiveKit**, **Resend**, **Cloudinary**. Google Drive es opcional.

---

## Comandos

```bash
# Backend
npm run start:dev        # desarrollo con hot reload
npm run build            # compilar (incluye prisma generate)
npm run test             # tests unitarios Jest

# Frontend
npm run dev              # desarrollo
npm run build            # build de producción
npm run check            # type check (svelte-check)
npm run lint             # Prettier + ESLint

# Prisma (desde apps/backend)
npx prisma migrate dev   # crear y aplicar migración
npx prisma studio        # explorador visual de la base de datos
```

---

## Despliegue

| App | Plataforma | Notas |
|---|---|---|
| Frontend | Vercel | `vercel.json` reescribe `/api/*` al backend |
| Backend | Render / Railway | `railway.toml` incluido |

---

## Hoja de ruta

| Fase | Usuarios objetivo | Sincronización |
|---|---|---|
| **1 — Actual** | ≤ 100 | Socket.io + Maps en memoria |
| **2** | ≤ 1.000 | Socket.io + Redis pub/sub |
| **3** | ≥ 10.000 | WebTransport + Redis cluster |

Los Maps en memoria del Gateway están diseñados para sustituirse por Redis sin cambiar el contrato de eventos.

---

*Última actualización del README: junio 2026*
