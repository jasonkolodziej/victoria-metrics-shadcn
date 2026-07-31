<script lang="ts">
  import { Input } from "$lib/components/ui/input/index.js";
  import {
    formatExact,
    formatTimestamp,
    formatValue,
    labelSetToString,
  } from "$lib/vm/format.js";
  import type { PlotSeries } from "$lib/vm/types.js";
  import { Eye, EyeOff } from "@lucide/svelte";

  interface Props {
    series: PlotSeries[];
    mode: "range" | "instant";
    hidden: Set<string>;
    ontoggle: (id: string) => void;
  }

  let { series, mode, hidden, ontoggle }: Props = $props();

  let filter = $state("");
  let sortBy = $state<"last" | "min" | "max" | "avg" | "name">("last");
  let descending = $state(true);

  interface Row extends PlotSeries {
    last: number;
    min: number;
    max: number;
    avg: number;
    lastAt: number;
  }

  const rows: Row[] = $derived.by(() => {
    const needle = filter.trim().toLowerCase();
    return series
      .filter(
        (s) =>
          !needle ||
          (s.name + labelSetToString(s.labels)).toLowerCase().includes(needle),
      )
      .map((s) => {
        const values = s.points.map((p) => p.v);
        const last = s.points.at(-1);
        return {
          ...s,
          last: last?.v ?? NaN,
          lastAt: last?.t ?? NaN,
          min: values.length ? Math.min(...values) : NaN,
          max: values.length ? Math.max(...values) : NaN,
          avg: values.length
            ? values.reduce((a, b) => a + b, 0) / values.length
            : NaN,
        };
      })
      .sort((a, b) => {
        if (sortBy === "name") {
          const cmp = (a.name + labelSetToString(a.labels)).localeCompare(
            b.name + labelSetToString(b.labels),
          );
          return descending ? -cmp : cmp;
        }
        const cmp = (a[sortBy] || 0) - (b[sortBy] || 0);
        return descending ? -cmp : cmp;
      });
  });

  function sortOn(column: typeof sortBy) {
    if (sortBy === column) descending = !descending;
    else {
      sortBy = column;
      descending = column !== "name";
    }
  }

  const numericColumns = $derived(
    mode === "range"
      ? (["last", "avg", "min", "max"] as const)
      : (["last"] as const),
  );
</script>

<div class="bg-card border-border overflow-hidden rounded-md border">
  <div
    class="border-border flex items-center justify-between gap-3 border-b px-3 py-2"
  >
    <p class="eyebrow">Series</p>
    <Input
      bind:value={filter}
      placeholder="Filter by label"
      aria-label="Filter series"
      spellcheck={false}
      class="h-7 max-w-xs font-mono text-xs"
    />
  </div>

  {#if !rows.length}
    <p class="text-muted-foreground px-3 py-6 text-center font-mono text-xs">
      {series.length
        ? `Nothing matches "${filter}".`
        : "Run a query to see the series it returns."}
    </p>
  {:else}
    <div class="max-h-[26rem] overflow-auto">
      <table class="w-full border-collapse text-left">
        <thead class="bg-card sticky top-0 z-10">
          <tr class="border-border border-b">
            <th class="w-8"></th>
            <th class="px-2 py-1.5">
              <button
                class="eyebrow hover:text-foreground"
                onclick={() => sortOn("name")}
              >
                Label set
              </button>
            </th>
            {#each numericColumns as column (column)}
              <th class="px-2 py-1.5 text-right">
                <button
                  class="eyebrow hover:text-foreground {sortBy === column
                    ? 'text-foreground'
                    : ''}"
                  onclick={() => sortOn(column)}
                >
                  {column}{sortBy === column ? (descending ? " ↓" : " ↑") : ""}
                </button>
              </th>
            {/each}
          </tr>
        </thead>
        <tbody>
          {#each rows as row (row.id)}
            {@const isHidden = hidden.has(row.id)}
            <tr
              class="border-border/60 hover:bg-muted/60 border-b transition-colors {isHidden
                ? 'opacity-40'
                : ''}"
            >
              <td class="pl-2">
                <button
                  class="text-muted-foreground hover:text-foreground flex items-center gap-1.5"
                  aria-label={isHidden
                    ? `Show ${row.name}`
                    : `Hide ${row.name}`}
                  onclick={() => ontoggle(row.id)}
                >
                  {#if isHidden}
                    <EyeOff class="h-3 w-3" />
                  {:else}
                    <span
                      class="h-2 w-2 rounded-full"
                      style="background: var(--pen-{row.pen + 1})"
                    ></span>
                  {/if}
                </button>
              </td>
              <td class="max-w-0 px-2 py-1">
                <div
                  class="truncate font-mono text-[11.5px]"
                  title={row.name + labelSetToString(row.labels)}
                >
                  {#if row.name}<span class="font-medium">{row.name}</span
                    >{/if}<span class="text-muted-foreground"
                    >{labelSetToString(row.labels)}</span
                  >
                </div>
              </td>
              {#each numericColumns as column (column)}
                <td
                  class="px-2 py-1 text-right font-mono text-[11.5px] tabular whitespace-nowrap"
                >
                  {formatValue(row[column])}
                </td>
              {/each}
            </tr>
          {/each}
        </tbody>
      </table>
    </div>

    <div
      class="border-border text-muted-foreground flex justify-between border-t px-3 py-1.5 font-mono text-[11px] tabular"
    >
      <span
        >{rows.length.toLocaleString("en-US")} of {series.length.toLocaleString(
          "en-US",
        )} series</span
      >
      {#if mode === "instant" && rows[0] && Number.isFinite(rows[0].lastAt)}
        <span>evaluated {formatTimestamp(rows[0].lastAt)}</span>
      {/if}
    </div>
  {/if}
</div>
