import type { Context, Next } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { HonoEnv } from '../hono-env.js';

function clientIp(c: Context<HonoEnv>): string {
	return c.req.header('cf-connecting-ip') ?? c.req.header('x-forwarded-for') ?? 'unknown';
}

/** Equivalente a @Throttle({ default: { limit, ttl } }) de NestJS, por IP */
export function rateLimit(kind: string, limit: number, windowMs: number) {
	return async (c: Context<HonoEnv>, next: Next) => {
		const ip = clientIp(c);
		const stub = c.env.RATE_LIMITER_DO.get(c.env.RATE_LIMITER_DO.idFromName(`${kind}:${ip}`));
		const allowed = await stub.checkAndConsume(limit, windowMs);
		if (!allowed) throw new HTTPException(429, { message: 'Too Many Requests' });
		await next();
	};
}
