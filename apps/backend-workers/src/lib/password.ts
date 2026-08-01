import bcrypt from 'bcryptjs';

// bcryptjs = reimplementación pura JS de bcrypt, mismo formato de hash.
// Los passwordHash ya existentes en la DB de producción (hechos con
// bcrypt nativo) siguen validando sin migración — no cambiar por
// WebCrypto/Argon2, forzaría reset de contraseña a usuarios reales.
const SALT_ROUNDS = 12;

export function hashPassword(password: string): Promise<string> {
	return bcrypt.hash(password, SALT_ROUNDS);
}

export function verifyPassword(password: string, hash: string): Promise<boolean> {
	return bcrypt.compare(password, hash);
}
