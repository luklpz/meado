import { DurableObject } from 'cloudflare:workers';
import type { Env } from '../env.js';

// Reemplaza @nestjs/throttler (ThrottlerModule, en memoria de un único
// proceso) — Workers no tiene ese proceso persistente. Un DO por clave
// (IP, o IP+ruta para los límites más estrictos de auth) implementa una
// ventana fija simple, persistida en ctx.storage (no solo memoria: estos
// límites son de minutos/horas, no de milisegundos como los del gateway
// WS, así que si el DO hiberna entre intentos hace falta que sobreviva).
export class RateLimiterDO extends DurableObject<Env> {
	/** true si la petición está permitida (y se cuenta); false si se ha superado el límite en la ventana actual */
	async checkAndConsume(limit: number, windowMs: number): Promise<boolean> {
		const now = Date.now();
		const state = (await this.ctx.storage.get<{ count: number; windowStart: number }>('state')) ?? { count: 0, windowStart: now };

		if (now - state.windowStart >= windowMs) {
			state.count = 0;
			state.windowStart = now;
		}

		if (state.count >= limit) {
			await this.ctx.storage.put('state', state);
			return false;
		}

		state.count++;
		await this.ctx.storage.put('state', state);
		return true;
	}
}
