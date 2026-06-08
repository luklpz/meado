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
14. [Motor gráfico — Phaser](#14-motor-gráfico--phaser)
15. [Entorno de desarrollo](#15-entorno-de-desarrollo)
16. [Infraestructura y despliegue](#16-infraestructura-y-despliegue)
17. [Variables de entorno](#17-variables-de-entorno)
18. [Convenciones y decisiones de diseño](#18-convenciones-y-decisiones-de-diseño)

---

## 1. ¿Qué es Meado?

Meado es una **plataforma social de comunicación híbrida**. Combina lo mejor de las herramientas tipo Discord (servidores, canales de texto y voz, mensajes directos, lista de amigos) con un modo espacial 2D opcional donde los avatares se mueven por un mapa y la comunicación es por proximidad.

Dependiendo del tipo de servidor (`DISCORD` o `SPATIAL`), el mismo sistema de autenticación, amigos y mensajes se combina con una experiencia de juego 2D con audio de proximidad.

---

## 2. Concepto y diferencial

La mayoría de las herramientas de comunicación digital son planas: todos escuchan a todos o nadie escucha a nadie. El modo **Spatial** de Meado propone un modelo distinto: **la comunicación ocurre de forma orgánica según la posición**.

Esto replica dinámicas del mundo físico:
- Conversaciones espontáneas al cruzarte con alguien.
- Grupos que se forman y disuelven de forma natural.
- La posibilidad de estar presente sin estar obligado a participar.

La fórmula de volumen para servidores espaciales:

```
volumen = clamp(1 − distancia / R, 0, 1)
```

A distancia 0 el volumen es máximo. Al alcanzar el radio R el volumen es 0. La lógica corre completamente en el cliente — el backend nunca procesa medios.

---

## 3. Objetivos y fases de crecimiento

| Fase | Usuarios | Sincronización | Estado |
|------|----------|---------------|--------|
| **1 — Actual** | ≤ 100 | Socket.io + Maps en memoria | En producción |
| **2 — Futuro próximo** | ≤ 1.000 | Socket.io + Redis pub/sub | Planificado |
| **3 — Escala** | ≥ 10.000 | WebTransport + Redis cluster | Planificado |

Los Maps en memoria de `MessagesGateway` (salas de voz, estado de typing, usuarios online) están diseñados para ser sustituidos por Redis sin cambiar el contrato de eventos del Gateway.

---

## 4. Stack tecnológico

### Frontend

| Tecnología | Rol |
|-----------|-----|
| **SvelteKit 5** | Framework de aplicación (SSR + cliente) |
| **Vite** | Bundler y servidor de desarrollo |
| **Phaser 4** | Motor 2D para servidores de tipo Spatial (importación dinámica) |
| **socket.io-client** | Comunicación en tiempo real con el backend |
| **LiveKit SDK** | Cliente de audio/voz |

### Backend

| Tecnología | Rol |
|-----------|-----|
| **NestJS 11** | Framework de servidor (módulos, DI, decoradores) |
| **Socket.io 4** | Servidor WebSocket — `MessagesGateway` gestiona todos los eventos en tiempo real |
| **Prisma 7** | ORM con type-safety completo y migrations declarativas |
| **PostgreSQL** | Base de datos relacional (Supabase en producción) |
| **jsonwebtoken + bcrypt** | Autenticación JWT manual (sin Passport) |

### Servicios externos

| Servicio | Rol |
|---------|-----|
| **LiveKit** | SFU para audio/vídeo en canales de voz y servidores Spatial |
| **Cloudinary** | Almacenamiento de archivos adjuntos, avatares e iconos de servidor |
| **Google Drive** | Almacenamiento alternativo para adjuntos grandes (subida directa desde el cliente vía URL firmada) |
| **Resend** | Envío de emails transaccionales (verificación, recuperación de contraseña) |
| **Supabase** | PostgreSQL gestionado (Session Pooler, puerto 5432) |
| **Render** | Hosting del backend NestJS |
| **Vercel** | Hosting del frontend SvelteKit |

---

## 5. Arquitectura del sistema

```
┌──────────────────────────────────────────────────────────────┐
│                      NAVEGADOR (Cliente)                      │
│                                                               │
│  ┌──────────────────────┐   ┌─────────────────────────────┐  │
│  │  SvelteKit (UI)      │   │  Phaser 4 (solo Spatial)    │  │
│  │  Servidores, DMs,    │   │  Avatares, mapa, distancias │  │
│  │  Amigos, Perfil      │   │  Proximity audio (LiveKit)  │  │
│  └──────────┬───────────┘   └─────────────┬───────────────┘  │
│             └─────────────────────────────┘                  │
│                        │ socket.io-client                     │
│                        │ VITE_SOCKET_URL                      │
└────────────────────────┼─────────────────────────────────────┘
                         │ WebSocket
                         ▼
┌──────────────────────────────────────────────────────────────┐
│                   BACKEND (NestJS — Render)                   │
│                                                               │
│  ┌────────────────────────────────────────────────────────┐  │
│  │  MessagesGateway (WebSocket)                           │  │
│  │  Canales de texto · Canales de voz · DMs · Typing      │  │
│  │  Reacciones · Presencia · Solicitudes de amistad       │  │
│  └────────────────────────────────────────────────────────┘  │
│                                                               │
│  ┌─────────────┐  ┌──────────┐  ┌─────────┐  ┌──────────┐  │
│  │ ServersCtrl │  │ DmCtrl   │  │FriendsCtrl│ │UsersCtrl │  │
│  └─────────────┘  └──────────┘  └─────────┘  └──────────┘  │
│                                                               │
│  ┌─────────────────────┐  ┌────────────────────────────────┐ │
│  │    AuthController   │  │   StorageModule                │ │
│  │  JWT · Email · Perfil│  │  Cloudinary · Google Drive    │ │
│  └─────────────────────┘  └────────────────────────────────┘ │
│                                                               │
│  ┌─────────────────────────────────────────────────────┐     │
│  │  PrismaService (global) → Supabase PostgreSQL       │     │
│  └─────────────────────────────────────────────────────┘     │
└──────────────────────────────────────────────────────────────┘
                         │
                         ▼
            LiveKit SFU (audio/vídeo)
```

---

## 6. Estructura del repositorio

```
meado/
├── apps/
│   ├── frontend/                   # SvelteKit 5
│   │   └── src/
│   │       ├── lib/
│   │       │   ├── auth.ts                 # Store: login/register/logout
│   │       │   ├── socket.ts               # Store: conexión Socket.io
│   │       │   ├── livekit.ts              # Store: cliente LiveKit (Spatial)
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
│   │       │   │   └── socket-events.types.ts  # Espejo del backend
│   │       │   ├── components/
│   │       │   │   ├── ProfileMenu.svelte       # Barra inferior izquierda
│   │       │   │   ├── ServerProfileCard.svelte # Card de perfil en servidores
│   │       │   │   └── UserStatusBar.svelte     # Indicador de estado
│   │       │   └── game/
│   │       │       ├── GameScene.ts        # Factory de escena Phaser
│   │       │       └── PhaserGame.svelte   # Componente canvas (solo Spatial)
│   │       ├── routes/
│   │       │   ├── +layout.svelte
│   │       │   ├── +layout.server.ts       # Inyecta locals.user en todas las páginas
│   │       │   ├── login/
│   │       │   ├── register/
│   │       │   ├── forgot-password/
│   │       │   ├── reset-password/
│   │       │   ├── (app)/
│   │       │   │   └── home/
│   │       │   │       ├── +page.svelte    # Hub de amigos y DMs
│   │       │   │       └── dm/[id]/
│   │       │   │           └── +page.svelte  # Conversación DM
│   │       │   └── servers/
│   │       │       ├── +page.svelte        # Lista de servidores
│   │       │       └── [slug]/
│   │       │           └── +page.svelte    # Vista de servidor (canales, mensajes, voz)
│   │       └── hooks.server.ts             # Cookie → GET /auth/me → locals.user
│   │
│   └── backend/                    # NestJS 11
│       ├── src/
│       │   ├── auth/               # JWT, email, perfil, privacidad, notificaciones
│       │   ├── servers/            # CRUD servidores, canales, roles, bans, whitelist
│       │   ├── messages/           # MessagesGateway (WS) + /channels REST
│       │   ├── friends/            # Amigos, solicitudes, bloqueos
│       │   ├── dm/                 # Conversaciones directas 1:1 y grupo
│       │   ├── users/              # Búsqueda, perfiles públicos, reportes
│       │   ├── storage/            # Cloudinary (/upload) + Google Drive (/drive)
│       │   ├── email/              # EmailService (Resend)
│       │   ├── prisma/             # PrismaModule (global)
│       │   └── shared/types/       # permissions.ts, socket-events.types.ts
│       ├── prisma/
│       │   └── schema.prisma       # Modelos de base de datos
│       └── prisma.config.ts        # URL de Prisma (fuera de schema, v7)
│
├── CLAUDE.md                       # Instrucciones para Claude Code
└── DOCUMENTACIÓN.md                # Este archivo
```

---

## 7. Base de datos

### Modelos principales

**User** — usuario registrado:
- Identidad: `id` (CUID), `username`, `email`, `passwordHash`, `emailVerified`, `role` (`ADMIN|USER|SUPERADMIN`)
- Perfil: `name`, `avatarUrl`, `bio`, `pronouns`, `bannerColor`
- Privacidad: `allowDmsFromServerMembers`, `allowFriendRequestsFromAll`, `showActivityStatus`
- Notificaciones: `notifDms`, `notifMentions`, `notifSounds`, `notifEmailDigest`

**Server** — servidor de comunicación:
- `name`, `slug` (único, para URL), `description`, `iconUrl`
- `serverType`: `DISCORD | SPATIAL`
- `accessType`: `PUBLIC | PASSWORD | WHITELIST`
- `ownerId` → relación con `User`

**Channel** — canal dentro de un servidor:
- `type`: `TEXT | VOICE`
- `name`, `serverId`, `position` (orden)

**ServerRole** — rol personalizado por servidor:
- `name`, `color`, `permissions` (bitmask numérico)

**ServerMember** — membresía usuario-servidor:
- Clave compuesta `[userId, serverId]`
- `nickname` (opcional), `roleId` (opcional)

**ServerBan** — bans de servidor:
- `userId`, `serverId`, `reason`, `issuerId`

**ChannelRead** — seguimiento de mensajes leídos:
- `[userId, channelId]`, `lastReadAt`

**Message** — mensaje en canal de texto:
- `content`, `channelId`, `authorId`, `editedAt`
- Relaciones: `attachments` (Attachment[]), `reactions` (MessageReaction[])

**Attachment** — adjunto en mensaje de canal:
- `url`, `name`, `size`, `mimeType`

**MessageReaction** — reacción en mensaje de canal:
- Clave compuesta `[messageId, userId, emoji]`

**Friendship** — relación entre dos usuarios:
- `senderId`, `receiverId`
- `status`: `PENDING | ACCEPTED | BLOCKED`
- `aliasBySender`, `aliasByReceiver` (alias personalizados)

**DirectConversation** — conversación DM (1:1 o grupo):
- `name` (opcional, grupos), `canonicalKey` (único para 1:1)
- Relaciones: `members` (DirectConversationMember[]), `messages` (DirectMessage[])

**DirectMessage** — mensaje DM:
- `content`, `conversationId`, `authorId`, `editedAt`
- Relaciones: `attachments` (DirectAttachment[]), `reactions` (DirectMessageReaction[])

**Report** — reporte de usuario:
- `reporterId`, `targetUserId`, `reason`, `details`
- `status`: `PENDING | REVIEWED | DISMISSED`

### Configuración Prisma 7

La URL de la base de datos vive en `prisma.config.ts`, no en `schema.prisma`. El cliente generado se emite a `generated/prisma/` (ignorado por git) e importado como:

```typescript
import { PrismaClient } from '../../generated/prisma/client.js';
```

La extensión `.js` es obligatoria con el resolver `nodenext` aunque el fuente sea TypeScript.

---

## 8. Autenticación y perfiles

Auth JWT con cookies httpOnly. Sin Passport — usa `jsonwebtoken` + `bcrypt` + `cookie-parser` directamente.

### Endpoints de autenticación (`/auth`)

| Endpoint | Descripción |
|----------|-------------|
| `POST /auth/register` | Crea cuenta no verificada, envía email de verificación vía Resend. Sin auto-login. |
| `GET /auth/verify-email?token=xxx` | Marca `emailVerified: true`, redirige a `/login?verified=1` |
| `POST /auth/login` | Valida contraseña + verificación de email → cookie httpOnly `token` (7 días) |
| `POST /auth/forgot-password` | Envía email de recuperación (límite: 3/hora) |
| `POST /auth/reset-password` | Valida token de reset, actualiza contraseña |
| `GET /auth/me` | Devuelve `{ id, username, role, socketToken }` — `socketToken` es un JWT de 1h para Socket.io |
| `POST /auth/logout` | Borra cookie |
| `PATCH /auth/avatar` | Sube imagen de avatar vía multipart → Cloudinary (máx. 10 MB) |
| `PATCH /auth/profile` | Actualiza `{ name, bio, pronouns, bannerColor }` |
| `GET/PATCH /auth/privacy` | Lee/actualiza configuración de privacidad |
| `GET/PATCH /auth/notifications` | Lee/actualiza configuración de notificaciones |

**Primer usuario registrado es ADMIN automáticamente.**

### Token de Socket.io

`GET /auth/me` devuelve `socketToken`: un JWT de tipo `socket` (1h) que el cliente usa como `handshake.auth.token` al conectar el WebSocket. El Gateway verifica este token en cada conexión — token inválido o tipo incorrecto → desconexión inmediata.

---

## 9. Servidores y canales

### Tipos de servidor

- **DISCORD**: canales de texto y voz. Interfaz estándar.
- **SPATIAL**: mapa 2D con Phaser. Audio de proximidad vía LiveKit.

### Acceso a servidores

- **PUBLIC**: cualquier usuario autenticado puede unirse.
- **PASSWORD**: requiere `{ password }` en `POST /servers/:slug/join` — verificado con bcrypt.
- **WHITELIST**: solo usuarios añadidos por el admin mediante `POST /servers/:slug/whitelist`.

### Roles y permisos

Cada servidor puede tener roles personalizados (`ServerRole`) con un campo `permissions` en bitmask. Los permisos disponibles están definidos en `src/shared/types/permissions.ts`. Un `ServerMember` puede tener un rol asignado que le otorga permisos adicionales sobre ese servidor específico.

### Endpoints de servidores (`/servers`)

| Endpoint | Descripción |
|----------|-------------|
| `GET /servers` | Lista servidores del usuario |
| `POST /servers` | Crea servidor (solo ADMIN de la plataforma) |
| `GET /servers/:slug` | Detalle de servidor |
| `PATCH /servers/:slug` | Actualiza servidor (propietario o admin plataforma) |
| `DELETE /servers/:slug` | Elimina servidor |
| `PATCH /servers/:slug/icon` | Sube icono del servidor → Cloudinary |
| `GET /servers/:slug/unread` | Canales con mensajes no leídos |
| `POST /servers/:slug/join` | Unirse al servidor |
| `POST /servers/:slug/leave` | Salir del servidor |
| `GET /servers/:slug/members` | Lista de miembros |
| `DELETE /servers/:slug/members/:userId` | Expulsar miembro |
| `PATCH /servers/:slug/members/:userId/nickname` | Cambiar apodo de miembro |
| `PATCH /servers/:slug/members/:userId/role` | Asignar rol a miembro |
| `POST/DELETE /servers/:slug/bans` | Banear/desbanear miembro |
| `GET /servers/:slug/bans` | Lista de bans |
| `POST/DELETE/GET /servers/:slug/whitelist` | Gestión de whitelist |
| `GET/POST/PATCH/DELETE /servers/:slug/roles` | Gestión de roles |
| `GET /servers/:slug/livekit-token` | Token LiveKit para modo Spatial |

### Endpoints de canales (`/channels`)

| Endpoint | Descripción |
|----------|-------------|
| `GET /channels/:id/messages` | Historial de mensajes (paginado, param `before` + `limit`) |
| `POST /channels/:id/messages` | Enviar mensaje (texto + adjunto opcional) |
| `PATCH /channels/:id/messages/:msgId` | Editar mensaje propio |
| `DELETE /channels/:id/messages/:msgId` | Borrar mensaje (propio o admin plataforma) |
| `PATCH /channels/:id/read` | Marcar canal como leído |
| `GET /channels/:id/livekit-token` | Token LiveKit para canal de voz |

---

## 10. Amigos y mensajes directos

### Amigos (`/friends`)

| Endpoint | Descripción |
|----------|-------------|
| `GET /friends` | Lista de amigos con estado online |
| `GET /friends/pending` | Solicitudes pendientes (entrantes y salientes) |
| `POST /friends/request` | Enviar solicitud por `{ identifier }` (username o email) |
| `POST /friends/accept/:id` | Aceptar solicitud |
| `PATCH /friends/:id/alias` | Establecer alias personalizado para un amigo |
| `DELETE /friends/:id` | Eliminar amistad |
| `POST /friends/block/:targetId` | Bloquear usuario |
| `DELETE /friends/block/:targetId` | Desbloquear usuario |

El estado `BLOCKED` en `Friendship` cubre tanto "bloqueado por mí" como "bloqueado por ellos" según el `senderId`.

### Mensajes directos (`/dm`)

| Endpoint | Descripción |
|----------|-------------|
| `GET /dm` | Lista de conversaciones del usuario |
| `POST /dm` | Obtener o crear conversación 1:1 (`{ userIds }`) o grupo (`{ userIds, name, group: true }`) |
| `GET /dm/:id/messages` | Historial de mensajes (paginado) |
| `POST /dm/:id/messages` | Enviar mensaje (texto + adjunto opcional) |
| `PATCH /dm/:id/messages/:msgId` | Editar mensaje propio |
| `DELETE /dm/:id/messages/:msgId` | Borrar mensaje propio |
| `POST /dm/:id/members` | Añadir miembro a grupo DM |

### Búsqueda y perfiles de usuario (`/users`)

| Endpoint | Descripción |
|----------|-------------|
| `GET /users/search?q=...` | Busca usuarios por username o email (mínimo 2 caracteres) |
| `GET /users/:id/profile` | Perfil público: bio, pronombres, amigos en común, servidores en común, estado de amistad |
| `POST /users/:id/report` | Reportar usuario (límite: 1 reporte por usuario cada 24h) |

---

## 11. Comunicación en tiempo real

Un único `MessagesGateway` gestiona todos los eventos WebSocket. Autenticación con el `socketToken` de `GET /auth/me` en `handshake.auth.token`.

Rooms de Socket.io: `channel:{channelId}`, `dm:{conversationId}`, `voice:{channelId}`.

### Límites de velocidad en el Gateway

| Operación | Límite |
|-----------|--------|
| Mensajes (canal + DM, bucket compartido) | 1 mensaje cada 500 ms por usuario |
| Reacciones | 1 toggle cada 250 ms por usuario |
| `voice:join` (re-unirse al mismo canal) | 1 vez cada 2000 ms por usuario |

### Eventos cliente → servidor

| Evento | Payload | Descripción |
|--------|---------|-------------|
| `channel:join` | `{ channelId }` | Suscribirse a sala de canal de texto |
| `channel:leave` | `{ channelId }` | Desuscribirse |
| `message:send` | `{ channelId, content }` | Enviar mensaje (máx. 4.000 caracteres) |
| `typing:start` | `{ channelId }` | Empezar a escribir (se limpia solo a los 8s) |
| `typing:stop` | `{ channelId }` | Dejar de escribir |
| `voice:join` | `{ channelId }` | Unirse a canal de voz (un slot por usuario, evicción automática del anterior) |
| `voice:leave` | `{ channelId }` | Salir de canal de voz |
| `server:subscribe` | `{ serverId, channelIds }` | Recibir estado inicial de voz de todos los canales |
| `reaction:toggle` | `{ messageId, emoji }` | Alternar reacción en mensaje de canal |
| `dm:join` | `{ conversationId }` | Suscribirse a sala de conversación DM |
| `dm:leave` | `{ conversationId }` | Desuscribirse |
| `dm:send` | `{ conversationId, content }` | Enviar DM (máx. 4.000 caracteres) |
| `dm:reaction:toggle` | `{ messageId, emoji }` | Alternar reacción en DM |
| `dm:typing:start` | `{ conversationId }` | Empezar a escribir en DM |
| `dm:typing:stop` | `{ conversationId }` | Dejar de escribir en DM |

### Eventos servidor → cliente

| Evento | Payload | Descripción |
|--------|---------|-------------|
| `message:created` | objeto mensaje | Nuevo mensaje en canal |
| `message:updated` | objeto mensaje | Mensaje editado |
| `message:deleted` | `{ messageId, channelId }` | Mensaje borrado |
| `typing:update` | `{ channelId, usernames[] }` | Usuarios escribiendo en canal |
| `voice:state` | `{ channelId, members[] }` | Estado completo de sala de voz |
| `voice:joined` | `{ channelId, member }` | Usuario entró a canal de voz |
| `voice:left` | `{ channelId, userId }` | Usuario salió de canal de voz |
| `reaction:updated` | objeto reacción | Reacción cambiada en canal |
| `dm:message:created` | objeto mensaje | Nuevo DM |
| `dm:message:updated` | objeto mensaje | DM editado |
| `dm:message:deleted` | `{ messageId, conversationId }` | DM borrado |
| `dm:typing:update` | `{ conversationId, usernames[] }` | Usuarios escribiendo en DM |
| `dm:reaction:updated` | objeto reacción | Reacción cambiada en DM |
| `dm:member:added` | `{ conversationId, member }` | Nuevo miembro en grupo DM |
| `dm:conversation:joined` | `{ conversationId, conversation }` | El usuario fue añadido a un grupo DM |
| `presence:update` | `{ userId, online }` | Amigo conectado/desconectado |
| `friend:request` | objeto amistad | Nueva solicitud de amistad recibida |

---

## 12. Audio y vídeo — LiveKit

LiveKit actúa como **SFU** (Selective Forwarding Unit): recibe los streams de medios y los reenvía selectivamente sin procesar el contenido.

### Canales de voz (servidores Discord)

El cliente obtiene un token con `GET /channels/:channelId/livekit-token`. Se une a la sala de LiveKit con el ID del canal. El backend verifica que el usuario sea miembro del servidor antes de emitir el token.

### Servidores Spatial

El cliente obtiene un token con `GET /servers/:slug/livekit-token`. Se une a la sala `spatial-{slug}`. La lógica de proximidad corre completamente en Phaser client-side:

```
volumen = clamp(1 − distancia / R, 0, 1)
```

Aplicado frame a frame al track de audio de cada participante remoto. El backend nunca recibe ni procesa medios.

### Configuración crítica de LiveKit (no cambiar)

- `adaptiveStream: false` — evita que los tracks se pausen en elementos ocultos.
- Los tracks remotos deben adjuntarse manualmente: `track.attach()` en el evento `TrackSubscribed`, el elemento se añade a `document.body` con `display: none`.
- Pipeline de micrófono: `getUserMedia → AudioContext → GainNode → AnalyserNode → MediaStreamDestinationNode → publishTrack`.

---

## 13. Subida de archivos

### Cloudinary (`POST /upload`)

- Máximo 25 MB por archivo
- SVG bloqueado (riesgo XSS cuando se renderiza inline)
- Devuelve `{ url, name, size, mimeType }`
- Archivos guardados en carpeta `meado/attachments/`
- Avatares (`PATCH /auth/avatar`) e iconos de servidor (`PATCH /servers/:slug/icon`) también usan Cloudinary

### Google Drive (subida en dos pasos)

1. `POST /drive/init-upload` `{ filename, mimeType }` → backend devuelve URL de subida reanudable + nonce
2. Cliente sube directamente a Drive usando esa URL (sin pasar por el backend)
3. `POST /drive/confirm` `{ fileId, nonce }` → backend hace el archivo público y devuelve `{ url }`

### Validación de adjuntos

Los adjuntos en mensajes se validan en el servidor: solo se aceptan URLs con prefijo `https://res.cloudinary.com/` o `https://drive.google.com/`.

---

## 14. Motor gráfico — Phaser

Phaser 4 solo se usa en servidores de tipo **SPATIAL**. Gestiona el canvas 2D: input de teclado (WASD / flechas), renderizado de avatares, loop de juego y cálculo de distancias.

### Importación dinámica

Phaser se importa siempre de forma dinámica dentro de `onMount`:

```javascript
const [Phaser, { createGameScene }] = await Promise.all([
  import('phaser'),
  import('./GameScene.js')
]);
```

SvelteKit ejecuta código en servidor durante el build. Phaser usa APIs de navegador que no existen en Node.js. La importación dentro de `onMount` garantiza que solo carga en el cliente.

### Factory function

`GameScene.ts` exporta `createGameScene(Phaser, socket, config)` — la clase se define a nivel de módulo pero recibe socket y configuración en tiempo de ejecución.

### Interpolación y throttle de posición

- Emisión de posición: **20 Hz** con comprobación de timestamp dentro de `update()` de Phaser. Nunca `setInterval`.
- Interpolación de avatares remotos: decaimiento exponencial cada frame.
  ```
  alpha = 1 − lerpStiffness ^ deltaTime
  posición = posiciónActual + (posiciónObjetivo − posiciónActual) × alpha
  ```

---

## 15. Entorno de desarrollo

### Requisitos previos

- Node.js 20+
- npm 10+
- Acceso a PostgreSQL (Supabase o local)

### Arrancar en local

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

El proxy de Vite reescribe `/api` → `http://localhost:3000` y `/socket.io` → `http://localhost:3000`. Todas las llamadas HTTP del frontend usan `/api/...` — nunca la URL directa del backend.

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

## 16. Infraestructura y despliegue

### Pipeline de despliegue

```
git push origin main
       │
       ├──▶  Vercel  →  Build SvelteKit  →  apps/frontend en producción (meado.es)
       │
       └──▶  Render  →  prisma generate + nest build  →  apps/backend (meado-backend.onrender.com)
```

### Backend — Render

- Plataforma: Render (Node.js web service)
- Build: `npm run build` (ejecuta `prisma generate && nest build`)
- Start: `npm run start:prod` (`node dist/main`)

### Frontend — Vercel

- Framework: SvelteKit (detección automática)
- Adapter: `@sveltejs/adapter-vercel`
- Reescritura de producción: `/api/:path*` → `https://meado-backend.onrender.com/:path*`

### URL de API

- **Desarrollo**: proxy Vite (`vite.config.ts`) reescribe `/api` y `/socket.io` a `localhost:3000`
- **Producción**: `vercel.json` reescribe `/api/:path*` al backend en Render

`VITE_SOCKET_URL` vacío en desarrollo (proxy), URL completa en producción.

---

## 17. Variables de entorno

### Backend (`apps/backend/.env`)

| Variable | Descripción |
|----------|-------------|
| `DATABASE_URL` | Connection string PostgreSQL (Supabase Session Pooler, puerto 5432) |
| `CORS_ORIGIN` | Origen(es) permitidos, separados por coma |
| `PORT` | Puerto del servidor (3000) |
| `JWT_SECRET` | Secreto para firmar todos los JWT |
| `LIVEKIT_URL` | URL del servidor LiveKit |
| `LIVEKIT_API_KEY` | Clave API de LiveKit |
| `LIVEKIT_API_SECRET` | Secreto API de LiveKit |
| `RESEND_API_KEY` | Clave API de Resend (emails) |
| `RESEND_FROM` | Dirección remitente (`noreply@meado.es`) |
| `FRONTEND_URL` | URL del frontend (para emails y redirecciones) |
| `CLOUDINARY_CLOUD_NAME` | Nombre del cloud en Cloudinary |
| `CLOUDINARY_API_KEY` | Clave API de Cloudinary |
| `CLOUDINARY_API_SECRET` | Secreto API de Cloudinary |
| `GOOGLE_CLIENT_ID` | ID de cliente OAuth de Google |
| `GOOGLE_CLIENT_SECRET` | Secreto de cliente OAuth de Google |
| `GOOGLE_REFRESH_TOKEN` | Token de refresco OAuth de Google Drive |
| `GOOGLE_DRIVE_FOLDER_ID` | ID de carpeta destino en Google Drive |

### Frontend (`apps/frontend/.env`)

| Variable | Descripción |
|----------|-------------|
| `VITE_SOCKET_URL` | URL del backend para Socket.io (vacío en dev → proxy) |
| `VITE_LIVEKIT_URL` | URL del servidor LiveKit |
| `BACKEND_URL` | URL privada del backend (server-side en `hooks.server.ts`) |

> Las variables `VITE_*` se incrustan en el bundle en build time — no incluir secretos con este prefijo.

---

## 18. Convenciones y decisiones de diseño

### Tipos de Socket.io en espejo

Los contratos de eventos están duplicados en:
- `apps/backend/src/shared/types/socket-events.types.ts`
- `apps/frontend/src/lib/types/socket-events.types.ts`

Al modificar un evento, ambos archivos deben actualizarse manualmente. No existe un paquete compartido porque las dos apps son independientes.

### Sin Passport para autenticación

Auth implementada directamente con `jsonwebtoken` + `bcrypt`. Menos abstracción, más control, sin dependencias extra en el proceso de token.

### Un solo WebSocket Gateway

`MessagesGateway` gestiona todos los eventos en tiempo real: canales, DMs, voz, typing, reacciones, presencia y solicitudes de amistad. Facilita compartir estado cross-domain (e.g., `onlineUsers` accesible desde `FriendsController`).

### Identidad desde el JWT, nunca del cliente

El Gateway extrae `userId` y `username` del JWT verificado en `handleConnection`. El payload de cualquier evento enviado por el cliente nunca es fuente de verdad para la identidad del emisor.

### Un slot de voz por usuario

La lógica `voiceActiveSocket` garantiza que cada usuario solo puede estar en un canal de voz a la vez. Al unirse a un canal nuevo, se evicta automáticamente del anterior. El `channelId` activo se toma del estado del servidor (`voiceSocketChannel`), nunca del payload del cliente.

### Adjuntos: solo Cloudinary o Drive

El servidor valida que las URLs de adjuntos empiecen por `https://res.cloudinary.com/` o `https://drive.google.com/` antes de persistirlas. SVG bloqueado en el endpoint de subida por riesgo XSS.

### Prisma 7: datasource en `prisma.config.ts`

Prisma 7 separa la URL de conexión del esquema. El archivo `prisma.config.ts` es ejecutado por la CLI de Prisma con `tsx`, fuera del árbol de compilación de TypeScript del proyecto.

### `module: "commonjs"` en tsconfig del backend

NestJS usa CommonJS. `prisma.config.ts` queda excluido del `tsconfig.json` para evitar conflictos con el modo de módulo.

---

*Documento actualizado: junio 2026*
