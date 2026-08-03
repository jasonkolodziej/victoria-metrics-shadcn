/**
 * Types for the VictoriaMetrics HTTP API.
 *
 * VictoriaMetrics is Prometheus-API-compatible, so these mirror the Prometheus
 * querying API shapes, plus a few VM-only additions (`limit` on /series,
 * /status/tsdb cardinality stats).
 */

/** A label set. `__name__` holds the metric name when present. */
export type Labels = Record<string, string>;

/** `[unixSecondsWithFraction, valueAsString]`. Values are strings so that
 *  NaN / +Inf / -Inf and full float64 precision survive JSON transport. */
export type Sample = [number, string];

export interface VectorSeries {
	metric: Labels;
	value: Sample;
}

export interface MatrixSeries {
	metric: Labels;
	values: Sample[];
}

export type QueryData =
	| { resultType: 'vector'; result: VectorSeries[] }
	| { resultType: 'matrix'; result: MatrixSeries[] }
	| { resultType: 'scalar'; result: Sample }
	| { resultType: 'string'; result: Sample };

export type ApiEnvelope<T> =
	| { status: 'success'; data: T; warnings?: string[]; trace?: TraceSpan }
	| { status: 'error'; errorType?: string; error: string };

/** One node of the `trace=1` execution tree VictoriaMetrics can attach to a query. */
export interface TraceSpan {
	duration_msec: number;
	message: string;
	children?: TraceSpan[];
}

/** One row of /api/v1/status/tsdb cardinality output. */
export interface TsdbEntry {
	name: string;
	value: number;
}

export interface TsdbStatus {
	totalSeries: number;
	totalLabelValuePairs: number;
	seriesCountByMetricName: TsdbEntry[];
	seriesCountByLabelName?: TsdbEntry[];
	labelValueCountByLabelName?: TsdbEntry[];
	seriesCountByLabelValuePair?: TsdbEntry[];
}

/** Which query shape the console is running. */
export type QueryMode = 'range' | 'instant';

/** Normalised series used by the plot and tables, regardless of result type. */
export interface PlotSeries {
	/** Stable key derived from the label set. */
	id: string;
	/** Metric name, or `{...}` if the expression produced no `__name__`. */
	name: string;
	/** Labels excluding `__name__`. */
	labels: Labels;
	points: Array<{ t: number; v: number }>;
	/** Index into the pen palette. */
	pen: number;
}

export class VmError extends Error {
	readonly errorType?: string;
	readonly status?: number;

	constructor(message: string, errorType?: string, status?: number) {
		super(message);
		this.name = 'VmError';
		this.errorType = errorType;
		this.status = status;
	}
}
