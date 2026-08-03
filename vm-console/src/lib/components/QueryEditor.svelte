<script lang="ts">
  import {
    metricsqlLanguage,
    metricsqlCompletionSource,
  } from "$lib/vm/metricsql.js";
  import { VmClient } from "$lib/vm/client.js";
  import {
    closeBrackets,
    closeBracketsKeymap,
    autocompletion,
    completionKeymap,
  } from "@codemirror/autocomplete";
  import {
    defaultKeymap,
    history,
    historyKeymap,
    insertNewlineAndIndent,
  } from "@codemirror/commands";
  import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
  import { tags } from "@lezer/highlight";
  import { EditorState } from "@codemirror/state";
  import { EditorView, keymap, placeholder as cmPlaceholder } from "@codemirror/view";
  import { onDestroy, untrack } from "svelte";

  interface Props {
    value: string;
    onRun: () => void;
    startMs: number;
    endMs: number;
    disabled?: boolean;
    placeholder?: string;
  }

  let {
    value = $bindable(),
    onRun,
    startMs,
    endMs,
    disabled = false,
    placeholder = "",
  }: Props = $props();

  let container: HTMLDivElement;
  let view: EditorView | undefined;
  let lastKnownValue = value;

  const client = new VmClient();
  const TTL_MS = 60_000;
  let metricNamesCache: { at: number; promise: Promise<string[]> } | null = null;
  let labelNamesCache: { at: number; promise: Promise<string[]> } | null = null;
  const labelValuesCache = new Map<string, { at: number; promise: Promise<string[]> }>();

  function metricNames() {
    if (!metricNamesCache || Date.now() - metricNamesCache.at > TTL_MS) {
      metricNamesCache = {
        at: Date.now(),
        promise: client.labelValues("__name__", startMs, endMs).catch(() => []),
      };
    }
    return metricNamesCache.promise;
  }

  function labelNames() {
    if (!labelNamesCache || Date.now() - labelNamesCache.at > TTL_MS) {
      labelNamesCache = {
        at: Date.now(),
        promise: client.labelNames(startMs, endMs).catch(() => []),
      };
    }
    return labelNamesCache.promise;
  }

  function labelValues(label: string) {
    const cached = labelValuesCache.get(label);
    if (!cached || Date.now() - cached.at > TTL_MS) {
      const promise = client.labelValues(label, startMs, endMs).catch(() => []);
      labelValuesCache.set(label, { at: Date.now(), promise });
      return promise;
    }
    return cached.promise;
  }

  const highlight = syntaxHighlighting(
    HighlightStyle.define([
      { tag: tags.keyword, color: "var(--accent)" },
      { tag: tags.function(tags.variableName), color: "var(--primary)" },
      { tag: tags.variableName, color: "var(--foreground)" },
      { tag: tags.number, color: "var(--pen-3)" },
      { tag: tags.string, color: "var(--pen-5)" },
      { tag: tags.comment, color: "var(--muted-foreground)", fontStyle: "italic" },
      { tag: tags.operator, color: "var(--muted-foreground)" },
    ]),
  );

  const theme = EditorView.theme({
    "&": {
      fontSize: "13px",
      backgroundColor: "var(--card)",
      color: "var(--foreground)",
    },
    "&.cm-focused": { outline: "none" },
    ".cm-content": {
      fontFamily: "var(--font-mono)",
      padding: "0.6rem 5.5rem 0.6rem 0.75rem",
      caretColor: "var(--primary)",
      minHeight: "4.25rem",
    },
    ".cm-scroller": { lineHeight: "1.6", overflow: "auto" },
    ".cm-line": { padding: "0" },
    ".cm-placeholder": { color: "var(--muted-foreground)" },
    ".cm-tooltip": {
      backgroundColor: "var(--popover)",
      color: "var(--popover-foreground)",
      border: "1px solid var(--border)",
    },
    ".cm-tooltip-autocomplete": {
      fontFamily: "var(--font-mono)",
      fontSize: "12px",
    },
    ".cm-tooltip-autocomplete ul li[aria-selected]": {
      backgroundColor: "var(--primary)",
      color: "var(--primary-foreground)",
    },
    ".cm-selectionBackground, &.cm-focused .cm-selectionBackground": {
      backgroundColor: "var(--muted)",
    },
  });

  $effect(() => {
    // Read once, at construction time. This effect must run exactly once
    // (mount/destroy) — if it read `value` reactively, the editor's own
    // updateListener writing back to `value` on every keystroke would
    // re-trigger it, tearing down and rebuilding the view (and losing
    // focus) on every character typed.
    const initialValue = untrack(() => value);
    const initialPlaceholder = untrack(() => placeholder);
    const initialDisabled = untrack(() => disabled);

    view = new EditorView({
      parent: container,
      state: EditorState.create({
        doc: initialValue,
        extensions: [
          metricsqlLanguage,
          highlight,
          theme,
          EditorView.lineWrapping,
          cmPlaceholder(initialPlaceholder),
          closeBrackets(),
          autocompletion({
            override: [
              metricsqlCompletionSource({ metricNames, labelNames, labelValues }),
            ],
          }),
          keymap.of([
            ...completionKeymap,
            {
              key: "Enter",
              run: () => {
                onRun();
                return true;
              },
            },
            { key: "Shift-Enter", run: insertNewlineAndIndent },
            ...closeBracketsKeymap,
            ...historyKeymap,
            ...defaultKeymap,
          ]),
          history(),
          EditorView.updateListener.of((update) => {
            if (!update.docChanged) return;
            lastKnownValue = update.state.doc.toString();
            value = lastKnownValue;
          }),
          EditorView.editable.of(!initialDisabled),
        ],
      }),
    });
    return () => view?.destroy();
  });

  $effect(() => {
    if (value !== lastKnownValue && view) {
      lastKnownValue = value;
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: value },
      });
    }
  });

  onDestroy(() => view?.destroy());
</script>

<div
  bind:this={container}
  class="bg-card border-input rounded-md border"
  role="textbox"
  aria-label="MetricsQL expression"
  tabindex="-1"
></div>
