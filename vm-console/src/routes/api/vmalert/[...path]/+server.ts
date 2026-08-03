import { env } from '$env/dynamic/private';
import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

/**
 * Read-only proxy to vmalert, mirroring `api/vm/[...path]` — the browser
 * never talks to vmalert directly, credentials stay on the server, and only
 * the endpoints below are reachable.
 */
const ALLOWED = new Set(['groups', 'alerts', 'rule']);

function isAllowed(path: string) {
	return ALLOWED.has(path);
}

function upstreamBase() {
	return (env.VMALERT_URL ?? 'http://localhost:8880').replace(/\/$/, '');
}

function authHeaders(): HeadersInit {
	const headers: Record<string, string> = { Accept: 'application/json' };
	if (env.VMALERT_BEARER_TOKEN) {
		headers.Authorization = `Bearer ${env.VMALERT_BEARER_TOKEN}`;
	} else if (env.VMALERT_BASIC_AUTH) {
		headers.Authorization = `Basic ${btoa(env.VMALERT_BASIC_AUTH)}`;
	}
	return headers;
}

export const GET: RequestHandler = async ({ params, url, fetch }) => {
	const path = params.path ?? '';

	if (!isAllowed(path)) {
		error(404, `No vmalert endpoint at /${path}.`);
	}

	const target = `${upstreamBase()}/api/v1/${path}${url.search}`;
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), Number(env.VMALERT_TIMEOUT_MS ?? 15_000));

	try {
		const upstream = await fetch(target, {
			headers: authHeaders(),
			signal: controller.signal
		});

		const text = await upstream.text();
		let body: unknown;
		try {
			body = JSON.parse(text);
		} catch {
			// vmalert answers plain text on some failures (bad auth, wrong port).
			// Wrap it so the client only ever parses one shape.
			return json(
				{
					status: 'error',
					errorType: 'upstream',
					error: text.slice(0, 500) || `vmalert returned ${upstream.status}.`
				},
				{ status: upstream.status === 200 ? 502 : upstream.status }
			);
		}

		return json(body, { status: upstream.status });
	} catch (err) {
		const aborted = err instanceof Error && err.name === 'AbortError';
		return json(
			{
				status: 'error',
				errorType: aborted ? 'timeout' : 'transport',
				error: aborted
					? 'The request took too long and was cancelled.'
					: `Could not reach vmalert at ${upstreamBase()}.`
			},
			{ status: aborted ? 504 : 502 }
		);
	} finally {
		clearTimeout(timeout);
	}
};
