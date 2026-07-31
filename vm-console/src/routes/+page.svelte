<script lang="ts">
  import MetricRail from "$lib/components/MetricRail.svelte";
  import PaperPlot from "$lib/components/PaperPlot.svelte";
  import QueryBar from "$lib/components/QueryBar.svelte";
  import RangeControl from "$lib/components/RangeControl.svelte";
  import ResultTable from "$lib/components/ResultTable.svelte";
  import StatusStrip from "$lib/components/StatusStrip.svelte";
  import { Button } from "$lib/components/ui/button/index.js";
  import { ConsoleState } from "$lib/state/console.svelte.js";
  import { PanelLeft } from "@lucide/svelte";
  import { SvelteSet } from "svelte/reactivity";

  const session = new ConsoleState();

  /** Series the user has clicked out of the plot. SvelteSet mutates reactively. */
  const hiddenSeries = new SvelteSet<string>();

  let railOpen = $state(false);

  const EXAMPLES = [
    "sum(rate(vm_http_requests_total[5m])) by (path)",
    "vm_data_size_bytes",
    "topk(5, sum(rate(vm_rows_inserted_total[5m])) by (type))",
    "histogram_quantile(0.95, sum(rate(vm_request_duration_seconds_bucket[5m])) by (le))",
  ];

  const MODES = [
    { id: "range", label: "Over time" },
    { id: "instant", label: "At a point" },
  ] as const;

  function toggleSeries(id: string) {
    if (hiddenSeries.has(id)) hiddenSeries.delete(id);
    else hiddenSeries.add(id);
  }

  function insertToken(token: string) {
    const current = session.expr.trim();
    session.expr = current ? `${current} ${token}` : token;
    railOpen = false;
  }

  $effect(() => {
    // Reading refreshMs here means changing the interval restarts the loop.
    session.refreshMs;
    session.startRefreshLoop();
    return () => session.stopRefreshLoop();
  });
</script>

<div class="grid h-full min-h-0 lg:grid-cols-[16rem_1fr]">
  <div class="hidden min-h-0 lg:block">
    <MetricRail
      startMs={session.startMs}
      endMs={session.endMs}
      onpick={insertToken}
    />
  </div>

  {#if railOpen}
    <div class="fixed inset-0 z-40 lg:hidden">
      <button
        class="absolute inset-0 bg-black/40"
        aria-label="Close the metric list"
        onclick={() => (railOpen = false)}
      ></button>
      <div class="absolute inset-y-0 left-0 w-72">
        <MetricRail
          startMs={session.startMs}
          endMs={session.endMs}
          onpick={insertToken}
        />
      </div>
    </div>
  {/if}

  <div class="min-h-0 overflow-y-auto">
    <div class="mx-auto flex max-w-6xl flex-col gap-4 p-4">
      <div class="lg:hidden">
        <Button
          variant="outline"
          size="sm"
          class="gap-1.5"
          onclick={() => (railOpen = true)}
        >
          <PanelLeft class="h-3.5 w-3.5" />
          Metrics
        </Button>
      </div>

      <QueryBar {session} />

      <div class="flex flex-wrap items-center justify-between gap-3">
        <div class="border-input flex overflow-hidden rounded-md border">
          {#each MODES as option (option.id)}
            <button
              class="px-3 py-1 font-mono text-xs transition-colors {session.mode ===
              option.id
                ? 'bg-primary text-primary-foreground'
                : 'hover:bg-muted'}"
              aria-pressed={session.mode === option.id}
              onclick={() => {
                session.mode = option.id;
                void session.run();
              }}
            >
              {option.label}
            </button>
          {/each}
        </div>

        <RangeControl {session} />
      </div>

      <StatusStrip {session} />

      {#if session.mode === "range"}
        <PaperPlot
          series={session.series}
          startMs={session.startMs}
          endMs={session.endMs}
          stepSec={session.stepSec}
          loading={session.loading}
          hidden={hiddenSeries}
          onzoom={(start, end) => session.zoomTo(start, end)}
        />
      {/if}

      <ResultTable
        series={session.series}
        mode={session.mode}
        hidden={hiddenSeries}
        ontoggle={toggleSeries}
      />

      {#if !session.ranAt && !session.loading}
        <div class="bg-card border-border rounded-md border p-4">
          <p class="eyebrow mb-2">Start here</p>
          <p class="text-muted-foreground mb-3 text-sm">
            Pick a metric from the left rail, or run one of these.
          </p>
          <ul class="flex flex-col gap-1.5">
            {#each EXAMPLES as example (example)}
              <li>
                <button
                  class="hover:bg-muted w-full rounded px-2 py-1 text-left font-mono text-xs break-all"
                  onclick={() => {
                    session.expr = example;
                    void session.run();
                  }}
                >
                  {example}
                </button>
              </li>
            {/each}
          </ul>
        </div>
      {/if}
    </div>
  </div>
</div>
