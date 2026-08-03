import { VmClient } from '$lib/vm/client.js';
import { autoStep, toPlotSeries } from '$lib/vm/format.js';
import {
	VmError,
	type PlotSeries,
	type QueryData,
	type QueryMode,
	type TraceSpan
} from '$lib/vm/types.js';

export interface RangePreset {
	label: string;
	ms: number;
}

export const RANGE_PRESETS: RangePreset[] = [
	{ label: '5m', ms: 5 * 60_000 },
	{ label: '15m', ms: 15 * 60_000 },
	{ label: '1h', ms: 3_600_000 },
	{ label: '6h', ms: 6 * 3_600_000 },
	{ label: '24h', ms: 24 * 3_600_000 },
	{ label: '7d', ms: 7 * 86_400_000 },
	{ label: '30d', ms: 30 * 86_400_000 }
];

export const REFRESH_OPTIONS = [
	{ label: 'Off', ms: 0 },
	{ label: '5s', ms: 5_000 },
	{ label: '15s', ms: 15_000 },
	{ label: '1m', ms: 60_000 },
	{ label: '5m', ms: 300_000 }
];

/**
 * One tab of the console: an expression, the window it runs over, and the last
 * result. Everything the UI renders is derived from here.
 */
export class ConsoleState {
	expr = $state('');
	mode = $state<QueryMode>('range');
	/** Width of the query window. */
	rangeMs = $state(3_600_000);
	/** Right edge of the window, or `null` to pin it to now. */
	anchorMs = $state<number | null>(null);
	/** Explicit step in seconds, or `null` to size it from the range. */
	stepOverride = $state<number | null>(null);
	refreshMs = $state(0);
	/** Ask VictoriaMetrics for an execution trace with the next run. */
	traceEnabled = $state(false);

	loading = $state(false);
	error = $state<string | null>(null);
	warnings = $state<string[]>([]);
	data = $state<QueryData | null>(null);
	trace = $state<TraceSpan | null>(null);
	elapsedMs = $state(0);
	ranAt = $state<number | null>(null);
	/** The expression that produced `data` — may lag behind `expr` while typing. */
	ranExpr = $state('');

	history = $state<string[]>([]);

	readonly #client: VmClient;
	#timer: ReturnType<typeof setInterval> | null = null;
	#generation = 0;

	constructor(client = new VmClient()) {
		this.#client = client;
	}

	get endMs() {
		return this.anchorMs ?? Date.now();
	}

	get startMs() {
		return this.endMs - this.rangeMs;
	}

	get live() {
		return this.anchorMs === null;
	}

	stepSec = $derived(this.stepOverride ?? autoStep(this.rangeMs));

	series: PlotSeries[] = $derived(toPlotSeries(this.data));

	resultType = $derived(this.data?.resultType ?? null);

	/** True when the editor has moved on from the displayed result. */
	stale = $derived(this.ranAt !== null && this.expr.trim() !== this.ranExpr.trim());

	setRange(ms: number) {
		this.rangeMs = ms;
		this.anchorMs = null;
	}

	/** Zoom to a window the user dragged out on the plot. */
	zoomTo(startMs: number, endMs: number) {
		if (endMs - startMs < 1000) return;
		this.rangeMs = endMs - startMs;
		this.anchorMs = endMs;
		void this.run();
	}

	shift(direction: -1 | 1) {
		this.anchorMs = this.endMs + direction * this.rangeMs * 0.5;
		void this.run();
	}

	resume() {
		this.anchorMs = null;
		void this.run();
	}

	async run() {
		const expr = this.expr.trim();
		if (!expr) {
			this.data = null;
			this.error = null;
			this.ranAt = null;
			this.trace = null;
			this.ranExpr = '';
			return;
		}

		const generation = ++this.#generation;
		this.loading = true;
		this.error = null;

		try {
			const end = this.endMs;
			const result =
				this.mode === 'instant'
					? await this.#client.instant(expr, end, { trace: this.traceEnabled })
					: await this.#client.range(expr, end - this.rangeMs, end, this.stepSec, {
							trace: this.traceEnabled
						});

			// A newer query started while this one was in flight — drop the result.
			if (generation !== this.#generation) return;

			this.data = result.data;
			this.warnings = result.warnings;
			this.elapsedMs = result.elapsedMs;
			this.trace = result.trace ?? null;
			this.ranAt = Date.now();
			this.ranExpr = expr;
			this.remember(expr);
		} catch (err) {
			if (generation !== this.#generation) return;
			this.data = null;
			this.trace = null;
			this.error =
				err instanceof VmError ? err.message : 'Something went wrong running that query.';
		} finally {
			if (generation === this.#generation) this.loading = false;
		}
	}

	remember(expr: string) {
		this.history = [expr, ...this.history.filter((e) => e !== expr)].slice(0, 25);
	}

	/** Drives auto-refresh. Call from an `$effect` so it tears down with the page. */
	startRefreshLoop() {
		this.stopRefreshLoop();
		if (this.refreshMs <= 0) return;
		this.#timer = setInterval(() => {
			if (this.live && !this.loading) void this.run();
		}, this.refreshMs);
	}

	stopRefreshLoop() {
		if (this.#timer) clearInterval(this.#timer);
		this.#timer = null;
	}
}
