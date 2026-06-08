# Meado

Plataforma de comunicación social híbrida — servidores con canales de texto y voz, mensajes directos, sistema de amigos y un modo espacial 2D opcional con avatares y audio por proximidad.

## Características

- **Servidores** — canales de texto y voz, roles con permisos granulares, acceso público / contraseña / lista blanca
- **Mensajes directos** — DMs individuales y grupos
- **Amigos** — solicitudes, presencia online, bloqueos
- **Voz** — audio en tiempo real vía LiveKit
- **Modo espacial** — mapa 2D con Phaser, audio por proximidad
- **Archivos adjuntos** — Cloudinary (≤ 25 MB) y Google Drive (archivos grandes)
- **Perfiles** — avatar, bio, pronombres, privacidad configurable

## Stack

| Capa | Tecnología |
|---|---|
| Frontend | SvelteKit 5 + Vite |
| Backend | NestJS 11 + Socket.io |
| Base de datos | PostgreSQL + Prisma 7 |
| Voz | LiveKit |
| Almacenamiento | Cloudinary + Google Drive |
| Email | Resend |
| Auth | JWT (httpOnly cookie) |

## Estructura

```
apps/
  frontend/   SvelteKit 5 (puerto 5173)
  backend/    NestJS 11   (puerto 3000)
```

## Instalación

### Requisitos

- Node.js 20+
- PostgreSQL

### Backend

```bash
cd apps/backend
cp .env.example .env        # rellena las variables
npm install
npx prisma migrate dev
npm run start:dev
```

### Frontend

```bash
cd apps/frontend
cp .env.example .env        # rellena las variables
npm install
npm run dev
```

## Variables de entorno

Ver [`apps/backend/.env.example`](apps/backend/.env.example) y [`apps/frontend/.env.example`](apps/frontend/.env.example).

Servicios externos necesarios:
- **PostgreSQL** — base de datos principal
- **LiveKit** — servidor de voz/vídeo
- **Resend** — envío de emails (verificación, recuperación de contraseña)
- **Cloudinary** — imágenes y archivos adjuntos
- **Google Drive** — archivos adjuntos grandes (opcional)

## Comandos útiles

```bash
# Backend
npm run start:dev       # modo desarrollo
npm run build           # compilar
npm run test            # tests unitarios

# Frontend
npm run dev             # modo desarrollo
npm run build           # build de producción
npm run check           # type check

# Prisma (desde apps/backend)
npx prisma migrate dev  # aplicar migraciones
npx prisma studio       # explorador de base de datos
```

## Despliegue

- **Frontend** — Vercel (`apps/frontend/vercel.json` incluye rewrites a la API)
- **Backend** — Render / Railway (`apps/backend/railway.toml`)

## Licencia

MIT
