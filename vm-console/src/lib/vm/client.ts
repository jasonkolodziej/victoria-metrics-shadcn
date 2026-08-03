import {
	VmError,
	type ApiEnvelope,
	type Labels,
	type QueryData,
	type TraceSpan,
	type TsdbStatus
} from './types.js';

type FetchLike = typeof globalThis.fetch;

export interface QueryResult {
	data: QueryData;
	warnings: string[];
	/** Wall-clock round trip in milliseconds. */
	elapsedMs: number;
	trace?: TraceSpan;
}

/**
 * Talks to VictoriaMetrics through this app's own `/api/vm` proxy rather than
 * the database directly. That keeps credentials server-side and sidesteps CORS,
 * so the same build works against a laptop instance and a locked-down cluster.
 */
export class VmClient {
	#fetch: FetchLike;
	#base: string;

	constructor(fetchFn: FetchLike = globalThis.fetch, base = '/api/vm') {
		this.#fetch = fetchFn;
		this.#base = base.replace(/\/$/, '');
	}

	async #get<T>(path: string, params: Record<string, string | number | undefined | null>) {
		const search = new URLSearchParams();
		for (const [key, value] of Object.entries(params)) {
			if (value === undefined || value === null || value === '') continue;
			search.set(key, String(value));
		}
		const qs = search.toString();
		const url = `${this.#base}/${path}${qs ? `?${qs}` : ''}`;

		const startedAt = performance.now();
		let response: Response;
		try {
			response = await this.#fetch(url);
		} catch {
			throw new VmError(
				'Could not reach the VictoriaMetrics proxy. Check that the dev server is running.',
				'transport'
			);
		}
		const elapsedMs = performance.now() - startedAt;

		let body: ApiEnvelope<T>;
		try {
			body = (await response.json()) as ApiEnvelope<T>;
		} catch {
			throw new VmError(
				`VictoriaMetrics returned ${response.status} with a non-JSON body.`,
				'protocol',
				response.status
			);
		}

		if (body.status === 'error') {
			throw new VmError(body.error, body.errorType, response.status);
		}
		if (!response.ok) {
			throw new VmError(`VictoriaMetrics returned ${response.status}.`, 'http', response.status);
		}

		return { data: body.data, warnings: body.warnings ?? [], elapsedMs, trace: body.trace };
	}

	/** Evaluate an expression at a single point in time. */
	async instant(
		expr: string,
		atMs: number,
		opts: { timeoutSec?: number; trace?: boolean } = {}
	) {
		return this.#get<QueryData>('query', {
			query: expr,
			time: toUnix(atMs),
			timeout: opts.timeoutSec ? `${opts.timeoutSec}s` : undefined,
			trace: opts.trace ? '1' : undefined
		});
	}

	/** Evaluate an expression across a time range at a fixed resolution. */
	async range(
		expr: string,
		startMs: number,
		endMs: number,
		stepSec: number,
		opts: { trace?: boolean } = {}
	) {
		return this.#get<QueryData>('query_range', {
			query: expr,
			start: toUnix(startMs),
			end: toUnix(endMs),
			step: `${stepSec}s`,
			trace: opts.trace ? '1' : undefined
		});
	}

	/** All label names seen in the range. VM defaults to the current UTC day. */
	async labelNames(startMs: number, endMs: number) {
		const { data } = await this.#get<string[]>('labels', {
			start: toUnix(startMs),
			end: toUnix(endMs)
		});
		return data;
	}

	/** Values for one label. Pass `__name__` to list metric names. */
	async labelValues(label: string, startMs: number, endMs: number, limit = 2000) {
		const { data } = await this.#get<string[]>(`label/${encodeURIComponent(label)}/values`, {
			start: toUnix(startMs),
			end: toUnix(endMs),
			limit
		});
		return data;
	}

	/** Label sets matching a selector. `limit` is a VictoriaMetrics extension. */
	async series(match: string, startMs: number, endMs: number, limit = 500) {
		const { data } = await this.#get<Labels[]>('series', {
			'match[]': match,
			start: toUnix(startMs),
			end: toUnix(endMs),
			limit
		});
		return data;
	}

	/** Cardinality stats. Backs the same data as VM's cardinality explorer. */
	async tsdbStatus(topN = 20, date?: string) {
		const { data } = await this.#get<TsdbStatus>('status/tsdb', { topN, date });
		return data;
	}
}

function toUnix(ms: number) {
	return (ms / 1000).toFixed(3);
}
