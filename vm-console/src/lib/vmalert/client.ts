import {
	VmalertError,
	type VmalertAlertsResponse,
	type VmalertEnvelope,
	type VmalertGroup,
	type VmalertGroupsResponse,
	type VmalertRule
} from './types.js';

type FetchLike = typeof globalThis.fetch;

/**
 * Talks to vmalert through this app's own `/api/vmalert` proxy, the same
 * shape as `VmClient` talking to VictoriaMetrics through `/api/vm` — reads
 * only, credentials stay server-side, and only a small allowlist of paths
 * are reachable.
 */
export class VmalertClient {
	#fetch: FetchLike;
	#base: string;

	constructor(fetchFn: FetchLike = globalThis.fetch, base = '/api/vmalert') {
		this.#fetch = fetchFn;
		this.#base = base.replace(/\/$/, '');
	}

	async #get<T>(path: string, params: Record<string, string | undefined> = {}) {
		const search = new URLSearchParams();
		for (const [key, value] of Object.entries(params)) {
			if (value === undefined || value === '') continue;
			search.set(key, value);
		}
		const qs = search.toString();
		const url = `${this.#base}/${path}${qs ? `?${qs}` : ''}`;

		let response: Response;
		try {
			response = await this.#fetch(url);
		} catch {
			throw new VmalertError(
				'Could not reach the vmalert proxy. Check that the dev server is running.',
				'transport'
			);
		}

		let body: VmalertEnvelope<T>;
		try {
			body = (await response.json()) as VmalertEnvelope<T>;
		} catch {
			throw new VmalertError(
				`vmalert returned ${response.status} with a non-JSON body.`,
				'protocol',
				response.status
			);
		}

		if (body.status === 'error') {
			throw new VmalertError(body.error, body.errorType, response.status);
		}
		if (!response.ok) {
			throw new VmalertError(`vmalert returned ${response.status}.`, 'http', response.status);
		}

		return body.data;
	}

	/** Every configured rule group, each rule's health and last evaluation included. */
	async groups(): Promise<VmalertGroup[]> {
		const data = await this.#get<VmalertGroupsResponse>('groups');
		return data.groups;
	}

	/** Currently firing or pending alert instances, across all groups. */
	async alerts() {
		const data = await this.#get<VmalertAlertsResponse>('alerts');
		return data.alerts;
	}

	/** One rule's full detail, addressed by the ids `groups()` returns. */
	async rule(groupId: string, ruleId: string): Promise<VmalertRule> {
		return this.#get<VmalertRule>('rule', { group_id: groupId, rule_id: ruleId });
	}
}
