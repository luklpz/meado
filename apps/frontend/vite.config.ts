import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [sveltekit()],
	server: {
		proxy: {
			// HTTP API — proxied so the cookie es same-origin en desarrollo
			'/api': {
				target: 'http://localhost:3000',
				changeOrigin: true,
				rewrite: (path) => path.replace(/^\/api/, ''),
			},
			// Socket.io WebSocket — proxied también para que funcionen las cookies lax
			'/socket.io': {
				target: 'http://localhost:3000',
				ws: true,
			},
		},
	},
});
