import type { RequestHandler } from './$types';
import { env } from '$env/dynamic/private';

const handle: RequestHandler = async ({ request, params, url }) => {
	const backendUrl = env.BACKEND_URL ?? 'http://localhost:3000';
	const target = `${backendUrl}/${params.path}${url.search}`;

	const headers = new Headers(request.headers);
	headers.delete('host');

	const init: RequestInit = {
		method: request.method,
		headers,
		redirect: 'manual'
	};

	if (request.method !== 'GET' && request.method !== 'HEAD') {
		init.body = request.body;
		// @ts-expect-error duplex is required by fetch when body is a stream, missing from RequestInit types
		init.duplex = 'half';
	}

	const res = await fetch(target, init);

	const resHeaders = new Headers(res.headers);
	resHeaders.delete('content-encoding');
	resHeaders.delete('content-length');

	return new Response(res.body, {
		status: res.status,
		statusText: res.statusText,
		headers: resHeaders
	});
};

export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const PATCH = handle;
export const DELETE = handle;
export const OPTIONS = handle;
