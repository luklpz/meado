// See https://svelte.dev/docs/kit/types#app.d.ts
declare global {
	namespace App {
		interface Locals {
			user: { id: string; username: string; role: string; avatarUrl?: string | null } | null;
		}
	}
}

export {};
