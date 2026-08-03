/**
 * Types for vmalert's HTTP API — the rule-engine that evaluates alerting and
 * recording rules and can proxy them back into VictoriaMetrics. Separate from
 * `lib/vm/types.ts` because this is a different service with its own shapes,
 * reached through its own proxy route.
 */

export type VmalertLabels = Record<string, string>;

export type VmalertRuleType = 'alerting' | 'recording';
export type VmalertRuleHealth = 'ok' | 'err' | 'unknown';
export type VmalertAlertState = 'firing' | 'pending' | 'inactive';

/** One active instance of an alerting rule — a label set currently past threshold. */
export interface VmalertActiveAlert {
	id: string;
	group_id: string;
	rule?: string;
	labels: VmalertLabels;
	annotations?: Record<string, string>;
	state: VmalertAlertState;
	activeAt: string;
	value?: string;
	source?: string;
}

/** One rule inside a group — alerting or recording. */
export interface VmalertRule {
	id: string;
	group_id: string;
	file?: string;
	name: string;
	query: string;
	type: VmalertRuleType;
	duration?: number;
	labels?: VmalertLabels;
	annotations?: Record<string, string>;
	health: VmalertRuleHealth;
	last_error?: string;
	last_samples?: number;
	last_exec_time_seconds?: number;
	last_exec_duration_seconds?: number;
	/** Only present on alerting rules that currently have active instances. */
	alerts?: VmalertActiveAlert[];
}

export interface VmalertGroup {
	id: string;
	name: string;
	file?: string;
	interval?: string;
	last_evaluation?: string;
	concurrency?: number;
	rules: VmalertRule[];
}

export interface VmalertGroupsResponse {
	groups: VmalertGroup[];
}

export interface VmalertAlertsResponse {
	alerts: VmalertActiveAlert[];
}

export type VmalertEnvelope<T> =
	| { status: 'success'; data: T }
	| { status: 'error'; errorType?: string; error: string };

export class VmalertError extends Error {
	readonly errorType?: string;
	readonly status?: number;

	constructor(message: string, errorType?: string, status?: number) {
		super(message);
		this.name = 'VmalertError';
		this.errorType = errorType;
		this.status = status;
	}
}
