import { PrismaClient } from '../../generated/prisma/client.js';
import { PrismaPg } from '@prisma/adapter-pg';
import type { Env } from '../env.js';

// Workers = un isolate por request, no un proceso Node persistente:
// no hay singleton de conexión como en apps/backend/src/prisma/prisma.service.ts.
// Se crea un client nuevo por request; Hyperdrive hace el pooling real por
// debajo. env.DATABASE_URL queda como fallback si por lo que sea no hay
// binding de Hyperdrive disponible (no debería pasar una vez desplegado).
//
// Los Durable Objects SÍ son instancias persistentes en memoria entre
// llamadas (a diferencia de un handler REST normal aquí) — cada clase DO
// cachea su propio client en un campo `_db` y lo reutiliza mientras el DO
// siga vivo, en vez de llamar a esta función en cada mensaje WS. Encontrado
// durante la verificación de fase 5 (latencia de varios cientos de ms en
// operaciones DM que deberían ser casi instantáneas).
export function createDb(env: Env): PrismaClient {
	const connectionString = env.HYPERDRIVE?.connectionString ?? env.DATABASE_URL;
	const adapter = new PrismaPg({ connectionString });
	return new PrismaClient({ adapter });
}
