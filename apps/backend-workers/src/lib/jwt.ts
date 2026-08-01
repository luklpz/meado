import { SignJWT, jwtVerify, type JWTPayload } from 'jose';

// jose es WebCrypto-nativo (Workers-compatible), a diferencia de jsonwebtoken.
// API async y con secret como Uint8Array, no string plano — no es un swap 1:1.
function secretKey(secret: string): Uint8Array {
	return new TextEncoder().encode(secret);
}

export interface LoginTokenPayload extends JWTPayload {
	sub: string;
	username: string;
	role: string;
}

export interface VerifyTokenPayload extends JWTPayload {
	sub: string;
	email: string;
	type: 'verify';
}

export interface ResetTokenPayload extends JWTPayload {
	sub: string;
	type: 'reset';
}

export interface SocketTokenPayload extends JWTPayload {
	type: 'socket';
	id: string;
	username: string;
	role: string;
	avatarUrl: string | null;
}

export async function signLoginToken(secret: string, user: { id: string; username: string; role: string }): Promise<string> {
	return new SignJWT({ sub: user.id, username: user.username, role: user.role })
		.setProtectedHeader({ alg: 'HS256' })
		.setIssuedAt()
		.setExpirationTime('7d')
		.sign(secretKey(secret));
}

export async function signVerifyToken(secret: string, userId: string, email: string): Promise<string> {
	return new SignJWT({ sub: userId, email, type: 'verify' })
		.setProtectedHeader({ alg: 'HS256' })
		.setIssuedAt()
		.setExpirationTime('24h')
		.sign(secretKey(secret));
}

export async function signResetToken(secret: string, userId: string): Promise<string> {
	return new SignJWT({ sub: userId, type: 'reset' })
		.setProtectedHeader({ alg: 'HS256' })
		.setIssuedAt()
		.setExpirationTime('1h')
		.sign(secretKey(secret));
}

export async function signSocketToken(
	secret: string,
	user: { id: string; username: string; role: string; avatarUrl: string | null },
): Promise<string> {
	return new SignJWT({ type: 'socket', id: user.id, username: user.username, role: user.role, avatarUrl: user.avatarUrl })
		.setProtectedHeader({ alg: 'HS256' })
		.setIssuedAt()
		.setExpirationTime('1h')
		.sign(secretKey(secret));
}

// Devuelve null en vez de lanzar — cada caller decide cómo responder
// (401 en middleware, redirect a /login?error=... en verify-email, etc.)
export async function verifyToken<T extends JWTPayload>(secret: string, token: string): Promise<T | null> {
	try {
		const { payload } = await jwtVerify(token, secretKey(secret));
		return payload as T;
	} catch {
		return null;
	}
}
