import { PrismaClient } from '../../generated/prisma/client.js';
import { PrismaPg } from '@prisma/adapter-pg';
import type { Env } from '../env.js';

// Workers = un isolate por request, no un proceso Node persistente:
// no hay singleton de conexión como en apps/backend/src/prisma/prisma.service.ts.
// Se crea un client nuevo por request; Hyperdrive (fase 6) hace el pooling real
// por debajo. En fase 1 connectionString apunta directo a env.DATABASE_URL.
export function createDb(env: Env): PrismaClient {
	const adapter = new PrismaPg({ connectionString: env.DATABASE_URL });
	return new PrismaClient({ adapter });
}
