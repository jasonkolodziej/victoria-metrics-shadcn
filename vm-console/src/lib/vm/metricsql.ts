/**
 * A lightweight MetricsQL mode for CodeMirror 6: enough tokenising for
 * syntax colour, plus a completion source that mixes static language
 * keywords with metric and label names fetched from VictoriaMetrics.
 *
 * This is not a full grammar — MetricsQL has no published CodeMirror
 * language package — just a StreamLanguage tokenizer that recognises the
 * pieces worth colouring, and heuristic context-detection for completions.
 */
import { StreamLanguage, type StreamParser } from '@codemirror/language';
import {
	type Completion,
	type CompletionContext,
	type CompletionResult
} from '@codemirror/autocomplete';

/** Aggregation operators (MetricsQL is a superset of PromQL's). */
export const AGGREGATORS = [
	'sum',
	'min',
	'max',
	'avg',
	'group',
	'stddev',
	'stdvar',
	'count',
	'count_values',
	'bottomk',
	'topk',
	'quantile',
	'median',
	'any',
	'distinct',
	'limitk',
	'outliersk',
	'outliers_mad',
	'share'
];

/** A useful subset of MetricsQL/PromQL functions — not exhaustive. */
export const FUNCTIONS = [
	'rate',
	'irate',
	'increase',
	'increase_pure',
	'delta',
	'idelta',
	'deriv',
	'predict_linear',
	'holt_winters',
	'sum_over_time',
	'avg_over_time',
	'min_over_time',
	'max_over_time',
	'count_over_time',
	'quantile_over_time',
	'stddev_over_time',
	'stdvar_over_time',
	'last_over_time',
	'first_over_time',
	'distinct_over_time',
	'absent',
	'absent_over_time',
	'present_over_time',
	'changes',
	'resets',
	'label_replace',
	'label_join',
	'label_set',
	'label_map',
	'label_del',
	'label_keep',
	'sort',
	'sort_desc',
	'sort_by_label',
	'abs',
	'ceil',
	'floor',
	'round',
	'exp',
	'ln',
	'log2',
	'log10',
	'sqrt',
	'clamp',
	'clamp_max',
	'clamp_min',
	'histogram_quantile',
	'histogram_share',
	'histogram_avg',
	'histogram_stddev',
	'vector',
	'scalar',
	'time',
	'timestamp',
	'day_of_week',
	'day_of_month',
	'days_in_month',
	'hour',
	'minute',
	'month',
	'year',
	'smooth_exponential',
	'running_sum',
	'running_avg',
	'running_max',
	'running_min',
	'union',
	'keep_last_value',
	'interpolate'
];

/** Modifier keywords that follow an aggregation or binary expression. */
export const KEYWORDS = [
	'by',
	'without',
	'on',
	'ignoring',
	'group_left',
	'group_right',
	'and',
	'or',
	'unless',
	'offset',
	'bool',
	'keep_metric_names'
];

const KEYWORD_SET = new Set([...AGGREGATORS, ...FUNCTIONS, ...KEYWORDS]);

const DURATION_UNIT = /^[smhdwy]/;

const parser: StreamParser<unknown> = {
	token(stream) {
		if (stream.eatSpace()) return null;

		if (stream.match('#')) {
			stream.skipToEnd();
			return 'comment';
		}

		if (stream.match(/^"(?:[^"\\]*(?:\\.[^"\\]*)*)"?/) || stream.match(/^'(?:[^'\\]*(?:\\.[^'\\]*)*)'?/)) {
			return 'string';
		}

		// Durations like 5m, 1h30m, 10s — checked before plain numbers.
		if (stream.match(/^\d+(?:\.\d+)?(?:ms|[smhdwy])(?:\d+(?:\.\d+)?(?:ms|[smhdwy]))*/)) {
			return 'number';
		}

		if (stream.match(/^\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/)) {
			return 'number';
		}

		if (stream.match(/^[a-zA-Z_:][\w:]*/)) {
			const word = stream.current();
			if (KEYWORD_SET.has(word)) return 'keyword';
			// A bare word directly followed by `(` is a call target even when it
			// isn't in the static list — MetricsQL keeps adding functions.
			if (stream.peek() === '(') return 'variableName.function';
			return 'variableName';
		}

		if (stream.match(/^[=!<>]=?|^=~|^!~/)) return 'operator';
		if (stream.match(/^[+\-*/%^]/)) return 'operator';
		if (stream.match(/^[{}()[\],;]/)) return 'punctuation';
		if (stream.match('@')) return 'operator';

		stream.next();
		return null;
	}
};

export const metricsqlLanguage = StreamLanguage.define(parser);

/** Everything the autocomplete source needs to fetch names on demand. */
export interface MetricsqlCompletionSource {
	metricNames(): Promise<string[]>;
	labelNames(): Promise<string[]>;
	labelValues(label: string): Promise<string[]>;
}

const LANGUAGE_COMPLETIONS: Completion[] = [
	...AGGREGATORS.map((label) => ({ label, type: 'keyword', boost: 1 }) as Completion),
	...FUNCTIONS.map((label) => ({ label, type: 'function' }) as Completion),
	...KEYWORDS.map((label) => ({ label, type: 'keyword' }) as Completion)
];

/** Are we inside an unclosed `{...}` at `pos`? */
function insideSelector(text: string, pos: number): boolean {
	let depth = 0;
	for (let i = 0; i < pos; i++) {
		if (text[i] === '{') depth++;
		else if (text[i] === '}') depth--;
	}
	return depth > 0;
}

/** Inside `{...}`, are we positioned to write a label value (after `label=`)? */
function labelValueContext(before: string): { label: string } | null {
	const openQuote = before.lastIndexOf('"');
	if (openQuote === -1) return null;
	// Walk backward from the opening quote to find the operator and label name.
	let i = openQuote - 1;
	while (i >= 0 && (before[i] === ' ' || before[i] === '\t')) i--;
	if (i >= 0 && (before[i] === '~' || before[i] === '=')) i--;
	if (i < 0 || (before[i] !== '=' && before[i] !== '!')) return null;
	i--;
	while (i >= 0 && (before[i] === ' ' || before[i] === '\t')) i--;
	const labelEnd = i + 1;
	while (i >= 0 && /\w/.test(before[i])) i--;
	const label = before.slice(i + 1, labelEnd);
	return label && /^[a-zA-Z_]/.test(label) ? { label } : null;
}

export function metricsqlCompletionSource(source: MetricsqlCompletionSource) {
	return async function completion(context: CompletionContext): Promise<CompletionResult | null> {
		const text = context.state.doc.toString();
		const pos = context.pos;
		const before = text.slice(0, pos);

		if (insideSelector(text, pos)) {
			const labelValue = labelValueContext(before);
			if (labelValue) {
				const word = context.matchBefore(/[^"]*/);
				if (!word) return null;
				const values = await source.labelValues(labelValue.label);
				return {
					from: word.from,
					options: values.map((label) => ({ label, type: 'text' })),
					validFor: /^[^"]*$/
				};
			}

			const word = context.matchBefore(/[a-zA-Z_:][\w:]*/);
			if (!word && !context.explicit) return null;
			const names = await source.labelNames();
			return {
				from: word ? word.from : pos,
				options: names.map((label) => ({ label, type: 'property', apply: `${label}="` })),
				validFor: /^[\w:]*$/
			};
		}

		const word = context.matchBefore(/[a-zA-Z_:][\w:]*/);
		if (!word && !context.explicit) return null;

		const names = await source.metricNames();
		const options = [
			...LANGUAGE_COMPLETIONS,
			...names.map((label) => ({ label, type: 'variable' }) as Completion)
		];
		return {
			from: word ? word.from : pos,
			options,
			validFor: /^[\w:]*$/
		};
	};
}
