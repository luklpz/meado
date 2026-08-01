// Envoltorio de mensaje WS nativo: { type, payload } en JSON.
// Sustituye el protocolo propio de Socket.io (que el cliente/servidor ya
// no hablan) — el contrato de nombres de evento se mantiene igual que en
// apps/backend/src/shared/types/socket-events.types.ts.

export interface WsEnvelope<T = unknown> {
	type: string;
	payload: T;
}

export function parseWsMessage(raw: string | ArrayBuffer): WsEnvelope | null {
	if (typeof raw !== 'string') return null;
	try {
		const parsed = JSON.parse(raw);
		if (typeof parsed?.type !== 'string') return null;
		return parsed as WsEnvelope;
	} catch {
		return null;
	}
}

export function wsSend(ws: WebSocket, type: string, payload: unknown): void {
	try {
		ws.send(JSON.stringify({ type, payload }));
	} catch {
		// socket cerrado entre el momento de listarlo y el envío — ignorar
	}
}

export function wsBroadcast(sockets: WebSocket[], type: string, payload: unknown, exclude?: WebSocket): void {
	for (const ws of sockets) {
		if (ws === exclude) continue;
		wsSend(ws, type, payload);
	}
}
