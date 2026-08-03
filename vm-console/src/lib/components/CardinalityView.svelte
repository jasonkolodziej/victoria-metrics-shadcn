<script lang="ts">
  import { Input } from "$lib/components/ui/input/index.js";
  import { Button } from "$lib/components/ui/button/index.js";
  import { VmClient } from "$lib/vm/client.js";
  import { VmError, type TsdbEntry, type TsdbStatus } from "$lib/vm/types.js";
  import { Loader2, RefreshCw } from "@lucide/svelte";

  const client = new VmClient();

  let topN = $state(20);
  let date = $state("");
  let status = $state<TsdbStatus | null>(null);
  let loading = $state(false);
  let error = $state<string | null>(null);
  let loadedOnce = $state(false);

  async function load() {
    loading = true;
    error = null;
    try {
      status = await client.tsdbStatus(topN, date || undefined);
      loadedOnce = true;
    } catch (err) {
      error = err instanceof VmError ? err.message : "Could not load cardinality stats.";
    } finally {
      loading = false;
    }
  }

  $effect(() => {
    if (!loadedOnce) void load();
  });

  const tables = $derived(
    status
      ? ([
          { title: "Series by metric name", rows: status.seriesCountByMetricName },
          { title: "Series by label name", rows: status.seriesCountByLabelName ?? [] },
          {
            title: "Label values by label name",
            rows: status.labelValueCountByLabelName ?? [],
          },
          {
            title: "Series by label=value pair",
            rows: status.seriesCountByLabelValuePair ?? [],
          },
        ] as Array<{ title: string; rows: TsdbEntry[] }>)
      : [],
  );
</script>

<div class="flex flex-col gap-4">
  <div class="flex flex-wrap items-end gap-3">
    <label class="flex flex-col gap-1">
      <span class="eyebrow">Top N</span>
      <Input
        type="number"
        min="1"
        max="1000"
        bind:value={topN}
        class="h-8 w-24 font-mono text-xs"
      />
    </label>
    <label class="flex flex-col gap-1">
      <span class="eyebrow">Date (UTC, optional)</span>
      <Input type="date" bind:value={date} class="h-8 w-40 font-mono text-xs" />
    </label>
    <Button variant="outline" size="sm" class="gap-1.5" onclick={() => load()}>
      {#if loading}
        <Loader2 class="h-3.5 w-3.5 animate-spin" />
      {:else}
        <RefreshCw class="h-3.5 w-3.5" />
      {/if}
      Reload
    </Button>
  </div>

  {#if error}
    <div class="border-destructive/40 bg-destructive/5 rounded-md border px-3 py-2">
      <p class="text-destructive font-mono text-xs">{error}</p>
    </div>
  {:else if loading && !loadedOnce}
    <div class="bg-card border-border space-y-1.5 rounded-md border p-4">
      {#each Array(8) as _, i (i)}
        <div
          class="bg-muted h-3.5 animate-pulse rounded"
          style="width: {40 + ((i * 17) % 55)}%"
        ></div>
      {/each}
    </div>
  {:else if status}
    <div
      class="text-muted-foreground flex flex-wrap gap-x-6 gap-y-1 font-mono text-xs"
    >
      <span class="tabular">{status.totalSeries.toLocaleString("en-US")} series</span>
      <span class="tabular"
        >{status.totalLabelValuePairs.toLocaleString("en-US")} label=value pairs</span
      >
    </div>

    <div class="grid gap-4 md:grid-cols-2">
      {#each tables as table (table.title)}
        <div class="bg-card border-border overflow-hidden rounded-md border">
          <p class="eyebrow border-border border-b px-3 py-2">{table.title}</p>
          {#if !table.rows.length}
            <p class="text-muted-foreground px-3 py-4 text-center font-mono text-xs">
              No data for this window.
            </p>
          {:else}
            <table class="w-full border-collapse text-left">
              <tbody>
                {#each table.rows as row (row.name)}
                  <tr class="border-border/60 hover:bg-muted/60 border-b transition-colors">
                    <td class="max-w-0 px-3 py-1">
                      <div class="truncate font-mono text-[11.5px]" title={row.name}>
                        {row.name}
                      </div>
                    </td>
                    <td
                      class="text-muted-foreground px-3 py-1 text-right font-mono text-[11.5px] tabular whitespace-nowrap"
                    >
                      {row.value.toLocaleString("en-US")}
                    </td>
                  </tr>
                {/each}
              </tbody>
            </table>
          {/if}
        </div>
      {/each}
    </div>
  {/if}
</div>
