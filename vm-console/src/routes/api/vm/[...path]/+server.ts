import { env } from '$env/dynamic/private';
import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

/**
 * Read-only proxy to VictoriaMetrics.
 *
 * The browser never talks to the database directly. That keeps credentials on
 * the server, avoids CORS entirely, and means only the endpoints below are
 * reachable — this is not an open forwarder.
 */
const ALLOWED = new Set([
	'query',
	'query_range',
	'series',
	'labels',
	'metadata',
	'status/tsdb',
	'status/active_queries',
	'status/top_queries'
]);

const LABEL_VALUES = /^label\/[^/]+\/values$/;

function isAllowed(path: string) {
	return ALLOWED.has(path) || LABEL_VALUES.test(path);
}

function upstreamBase() {
	// Single node: http://localhost:8428
	// Cluster:     http://vmselect:8481/select/0/prometheus
	return (env.VM_URL ?? 'http://localhost:8428').replace(/\/$/, '');
}

function authHeaders(): HeadersInit {
	const headers: Record<string, string> = { Accept: 'application/json' };
	if (env.VM_BEARER_TOKEN) {
		headers.Authorization = `Bearer ${env.VM_BEARER_TOKEN}`;
	} else if (env.VM_BASIC_AUTH) {
		headers.Authorization = `Basic ${btoa(env.VM_BASIC_AUTH)}`;
	}
	return headers;
}

export const GET: RequestHandler = async ({ params, url, fetch }) => {
	const path = params.path ?? '';

	if (!isAllowed(path)) {
		error(404, `No VictoriaMetrics endpoint at /${path}.`);
	}

	const target = `${upstreamBase()}/api/v1/${path}${url.search}`;
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), Number(env.VM_TIMEOUT_MS ?? 60_000));

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
			// VictoriaMetrics answers plain text on some failures (bad auth, wrong
			// port). Wrap it so the client only ever parses one shape.
			return json(
				{
					status: 'error',
					errorType: 'upstream',
					error: text.slice(0, 500) || `VictoriaMetrics returned ${upstream.status}.`
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
					? 'The query took too long and was cancelled.'
					: `Could not reach VictoriaMetrics at ${upstreamBase()}.`
			},
			{ status: aborted ? 504 : 502 }
		);
	} finally {
		clearTimeout(timeout);
	}
};
