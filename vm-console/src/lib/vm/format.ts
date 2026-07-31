import type { Labels, MatrixSeries, PlotSeries, QueryData, VectorSeries } from './types.js';

/** Six plotter-pen inks. Series cycle through them in result order. */
export const PENS = 6;

/** `{job="vmagent", instance="…"}` with `__name__` lifted out. */
export function splitMetric(metric: Labels): { name: string; labels: Labels } {
	const { __name__: name, ...labels } = metric;
	return { name: name ?? '', labels };
}

export function labelSetToString(labels: Labels): string {
	const inner = Object.keys(labels)
		.sort()
		.map((k) => `${k}="${labels[k]}"`)
		.join(', ');
	return `{${inner}}`;
}

export function seriesKey(metric: Labels): string {
	const { name, labels } = splitMetric(metric);
	return name + labelSetToString(labels);
}

export function seriesLabel(metric: Labels): string {
	const { name, labels } = splitMetric(metric);
	const set = labelSetToString(labels);
	if (!name) return set;
	return set === '{}' ? name : `${name}${set}`;
}

/** Turn any query result into the flat shape the plot and tables consume. */
export function toPlotSeries(data: QueryData | null): PlotSeries[] {
	if (!data) return [];

	if (data.resultType === 'matrix') {
		return data.result.map((s: MatrixSeries, i) => ({
			id: seriesKey(s.metric),
			...splitMetric(s.metric),
			points: s.values
				.map(([t, v]) => ({ t: t * 1000, v: Number(v) }))
				.filter((p) => Number.isFinite(p.v)),
			pen: i % PENS
		}));
	}

	if (data.resultType === 'vector') {
		return data.result.map((s: VectorSeries, i) => ({
			id: seriesKey(s.metric),
			...splitMetric(s.metric),
			points: [{ t: s.value[0] * 1000, v: Number(s.value[1]) }].filter((p) =>
				Number.isFinite(p.v)
			),
			pen: i % PENS
		}));
	}

	return [
		{
			id: 'scalar',
			name: 'scalar',
			labels: {},
			points: [{ t: data.result[0] * 1000, v: Number(data.result[1]) }].filter((p) =>
				Number.isFinite(p.v)
			),
			pen: 0
		}
	];
}

const SI = [
	{ e: 1e12, s: 'T' },
	{ e: 1e9, s: 'G' },
	{ e: 1e6, s: 'M' },
	{ e: 1e3, s: 'k' },
	{ e: 1, s: '' },
	{ e: 1e-3, s: 'm' },
	{ e: 1e-6, s: 'µ' },
	{ e: 1e-9, s: 'n' }
];

/** Compact formatting for axis labels and cursor readouts. */
export function formatValue(v: number): string {
	if (Number.isNaN(v)) return 'NaN';
	if (!Number.isFinite(v)) return v > 0 ? '+Inf' : '-Inf';
	if (v === 0) return '0';

	const abs = Math.abs(v);
	// Plain decimals read better across the range humans actually reason about.
	// SI prefixes only earn their place outside it — "500m" for 0.5 is noise.
	if (abs >= 0.001 && abs < 1000) {
		return trimZeros(v.toFixed(abs >= 100 ? 1 : abs >= 1 ? 2 : 4));
	}

	const unit = SI.find((u) => abs >= u.e) ?? SI[SI.length - 1];
	const scaled = v / unit.e;
	const precision = Math.abs(scaled) >= 100 ? 0 : Math.abs(scaled) >= 10 ? 1 : 2;
	return `${trimZeros(scaled.toFixed(precision))}${unit.s}`;
}

/** Full precision, for tables where the exact sample matters. */
export function formatExact(raw: string): string {
	const n = Number(raw);
	if (!Number.isFinite(n)) return raw;
	if (Number.isInteger(n) && Math.abs(n) < 1e15) return n.toLocaleString('en-US');
	return trimZeros(n.toPrecision(8));
}

function trimZeros(s: string) {
	return s.includes('.') ? s.replace(/\.?0+$/, '') : s;
}

export function formatDuration(ms: number): string {
	if (ms < 1000) return `${Math.round(ms)}ms`;
	const s = ms / 1000;
	if (s < 60) return `${trimZeros(s.toFixed(2))}s`;
	const m = Math.floor(s / 60);
	if (m < 60) return `${m}m ${Math.round(s % 60)}s`;
	const h = Math.floor(m / 60);
	return `${h}h ${m % 60}m`;
}

/** Time-axis labels adapt to the span so ticks never repeat themselves. */
export function timeFormatter(spanMs: number): (ms: number) => string {
	const day = 86_400_000;
	if (spanMs <= 2 * 3_600_000) {
		return (ms) => fmt(ms, { hour: '2-digit', minute: '2-digit', second: '2-digit' });
	}
	if (spanMs <= 2 * day) {
		return (ms) => fmt(ms, { hour: '2-digit', minute: '2-digit' });
	}
	if (spanMs <= 90 * day) {
		return (ms) => fmt(ms, { month: 'short', day: 'numeric' });
	}
	return (ms) => fmt(ms, { year: 'numeric', month: 'short' });
}

export function formatTimestamp(ms: number): string {
	return fmt(ms, {
		year: 'numeric',
		month: '2-digit',
		day: '2-digit',
		hour: '2-digit',
		minute: '2-digit',
		second: '2-digit'
	});
}

function fmt(ms: number, opts: Intl.DateTimeFormatOptions) {
	return new Intl.DateTimeFormat('en-GB', { ...opts, hour12: false }).format(new Date(ms));
}

/** Round a domain out to human-readable gridline values. */
export function niceTicks(min: number, max: number, count = 5): number[] {
	if (!Number.isFinite(min) || !Number.isFinite(max)) return [0, 1];
	if (min === max) {
		const pad = Math.abs(min) || 1;
		min -= pad / 2;
		max += pad / 2;
	}
	const raw = (max - min) / count;
	const mag = Math.pow(10, Math.floor(Math.log10(raw)));
	const norm = raw / mag;
	const step = (norm >= 5 ? 10 : norm >= 2 ? 5 : norm >= 1 ? 2 : 1) * mag;
	const first = Math.ceil(min / step) * step;

	const ticks: number[] = [];
	for (let t = first; t <= max + step * 1e-9; t += step) {
		ticks.push(Math.abs(t) < step * 1e-9 ? 0 : t);
	}
	return ticks;
}

/**
 * Pick a step that keeps the response under roughly `maxPoints` samples per
 * series, snapped to an interval a human would have typed.
 */
export function autoStep(spanMs: number, maxPoints = 1400): number {
	const target = spanMs / 1000 / maxPoints;
	const ladder = [
		1, 5, 10, 15, 30, 60, 120, 300, 600, 900, 1800, 3600, 7200, 10_800, 21_600, 43_200, 86_400
	];
	return ladder.find((s) => s >= target) ?? Math.ceil(target / 86_400) * 86_400;
}

export function formatStep(sec: number): string {
	if (sec < 60) return `${sec}s`;
	if (sec < 3600) return `${sec / 60}m`;
	if (sec < 86_400) return `${sec / 3600}h`;
	return `${sec / 86_400}d`;
}
