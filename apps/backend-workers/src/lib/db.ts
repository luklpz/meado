import { PrismaClient } from '../../generated/prisma/client.js';
import { PrismaPg } from '@prisma/adapter-pg';
import type { Env } from '../env.js';

// Workers = un isolate por request, no un proceso Node persistente:
// no hay singleton de conexión como en apps/backend/src/prisma/prisma.service.ts.
// Se crea un client nuevo por request; Hyperdrive (fase 6) hace el pooling real
// por debajo. En fase 1 connectionString apunta directo a env.DATABASE_URL.
//
// Los Durable Objects SÍ son instancias persistentes en memoria entre
// llamadas (a diferencia de un handler REST normal aquí) — cada clase DO
// cachea su propio client en un campo `_db` y lo reutiliza mientras el DO
// siga vivo, en vez de llamar a esta función en cada mensaje WS. Encontrado
// durante la verificación de fase 5 (latencia de varios cientos de ms en
// operaciones DM que deberían ser casi instantáneas).
export function createDb(env: Env): PrismaClient {
	const adapter = new PrismaPg({ connectionString: env.DATABASE_URL });
	return new PrismaClient({ adapter });
}
