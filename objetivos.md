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

- [ ] **Frontend (Vercel → Cloudflare Pages)**: SvelteKit con `@sveltejs/adapter-cloudflare`, reemplaza `vercel.json` rewrites por `_routes.json`/Pages Functions
- [ ] **Backend (Render → Cloudflare Workers)**: evaluar viabilidad NestJS en Workers runtime vs reescritura parcial
- [ ] **MessagesGateway → Durable Objects**: los Maps en memoria (voz, typing, online) pasan a un Durable Object con WebSocket hibernation (sustituye tanto Render como el Redis de Fase 2 del roadmap original)
- [ ] **Prisma en Workers**: adaptar cliente Prisma 7 al runtime (driver adapters o Prisma Accelerate — Workers no soporta el motor Node nativo de Prisma)
- [ ] **DNS/dominio**: mover `meado.es` a Cloudflare (si no está ya) y apuntar Pages + Workers
- [ ] **Env vars**: migrar todas las variables de Render/Vercel a Cloudflare (secrets de Workers vs `.env`)
- [ ] **LiveKit, Cloudinary, Drive, Resend, Supabase**: sin cambios, servicios externos independientes del hosting
- [ ] Verificar límites free tier (100k req/día Workers) son suficientes para Fase 1 (≤100 usuarios)

**Por qué:** tener frontend+backend en la misma plataforma (Cloudflare) simplifica gestión, y Workers no duerme por inactividad a diferencia de Render free tier.

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
