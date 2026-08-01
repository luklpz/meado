import type { Env } from './env.js';
import type { JwtUser } from './middleware/auth.js';

export type HonoEnv = { Bindings: Env; Variables: { user: JwtUser } };
