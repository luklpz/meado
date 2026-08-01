import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [sveltekit()],
	server: {
		proxy: {
			// apps/backend-workers (Hono + Durable Objects), no apps/backend
			// (NestJS) — desde la fase 4 el frontend ya no habla socket.io, así
			// que solo funciona en dev contra el backend nuevo (`wrangler dev`
			// en apps/backend-workers, puerto por defecto 8787 de wrangler; en
			// este repo se ha usado 8789 durante las pruebas de las fases 1-4).
			// IMPORTANTE: este proxy de Vite intercepta ANTES que la ruta
			// src/routes/api/[...path]/+server.ts de SvelteKit — en `vite dev`
			// manda este target, no BACKEND_URL (esa env var solo aplica bajo
			// `wrangler dev`/producción, donde no existe el proxy de Vite).
			'/api': {
				target: 'http://127.0.0.1:8789',
				changeOrigin: true,
				rewrite: (path) => path.replace(/^\/api/, ''),
			},
			'/ws': {
				target: 'http://127.0.0.1:8789',
				ws: true,
			},
		},
	},
});
