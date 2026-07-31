<script lang="ts">
  import { Input } from "$lib/components/ui/input/index.js";
  import { VmClient } from "$lib/vm/client.js";
  import { VmError } from "$lib/vm/types.js";
  import { Loader2, RefreshCw } from "@lucide/svelte";

  interface Props {
    startMs: number;
    endMs: number;
    /** Called when a metric or label is picked, to drop it into the editor. */
    onpick: (token: string) => void;
  }

  let { startMs, endMs, onpick }: Props = $props();

  const client = new VmClient();

  let tab = $state<"metrics" | "labels">("metrics");
  let filter = $state("");
  let metrics = $state<string[]>([]);
  let labels = $state<string[]>([]);
  let loading = $state(false);
  let error = $state<string | null>(null);
  let loadedOnce = $state(false);

  const items = $derived(tab === "metrics" ? metrics : labels);
  const needle = $derived(filter.trim().toLowerCase());
  const shown = $derived(
    needle
      ? items.filter((name) => name.toLowerCase().includes(needle))
      : items,
  );

  async function load() {
    loading = true;
    error = null;
    try {
      const [names, labelNames] = await Promise.all([
        client.labelValues("__name__", startMs, endMs),
        client.labelNames(startMs, endMs),
      ]);
      metrics = names.sort();
      labels = labelNames.filter((l) => l !== "__name__").sort();
      loadedOnce = true;
    } catch (err) {
      error =
        err instanceof VmError
          ? err.message
          : "Could not load the metric list.";
    } finally {
      loading = false;
    }
  }

  $effect(() => {
    if (!loadedOnce) void load();
  });
</script>

<aside class="border-border bg-card flex h-full min-h-0 flex-col border-r">
  <div
    class="border-border flex items-center justify-between border-b px-3 py-2"
  >
    <div class="flex gap-3">
      {#each [{ id: "metrics", label: "Metrics" }, { id: "labels", label: "Labels" }] as t (t.id)}
        <button
          class="eyebrow transition-colors {tab === t.id
            ? 'text-foreground border-primary border-b-2 pb-0.5'
            : 'hover:text-foreground'}"
          onclick={() => (tab = t.id as typeof tab)}
        >
          {t.label}
        </button>
      {/each}
    </div>
    <button
      class="text-muted-foreground hover:text-foreground"
      aria-label="Reload metric list"
      onclick={() => load()}
    >
      {#if loading}
        <Loader2 class="h-3.5 w-3.5 animate-spin" />
      {:else}
        <RefreshCw class="h-3.5 w-3.5" />
      {/if}
    </button>
  </div>

  <div class="border-border border-b p-2">
    <Input
      bind:value={filter}
      placeholder="Filter {tab}"
      aria-label="Filter {tab}"
      spellcheck={false}
      class="h-8 font-mono text-xs"
    />
  </div>

  <div class="min-h-0 flex-1 overflow-y-auto">
    {#if error}
      <div class="p-3">
        <p class="text-destructive font-mono text-xs">{error}</p>
        <p class="text-muted-foreground mt-1 font-mono text-[11px]">
          Set VM_URL in .env and restart the dev server.
        </p>
      </div>
    {:else if loading && !loadedOnce}
      <div class="space-y-1.5 p-3">
        {#each Array(10) as _, i (i)}
          <div
            class="bg-muted h-3.5 animate-pulse rounded"
            style="width: {45 + ((i * 13) % 50)}%"
          ></div>
        {/each}
      </div>
    {:else if !shown.length}
      <p class="text-muted-foreground p-3 font-mono text-xs">
        {needle ? `Nothing matches "${filter}".` : "No names in this window."}
      </p>
    {:else}
      <ul>
        {#each shown.slice(0, 500) as name (name)}
          <li>
            <button
              class="hover:bg-muted focus-visible:bg-muted block w-full truncate px-3 py-1 text-left font-mono text-[11.5px]"
              title={name}
              onclick={() => onpick(tab === "metrics" ? name : `${name}=""`)}
            >
              {name}
            </button>
          </li>
        {/each}
      </ul>
      {#if shown.length > 500}
        <p class="text-muted-foreground px-3 py-2 font-mono text-[11px]">
          {shown.length - 500} more — narrow the filter.
        </p>
      {/if}
    {/if}
  </div>

  <div
    class="border-border text-muted-foreground border-t px-3 py-1.5 font-mono text-[11px] tabular"
  >
    {shown.length.toLocaleString("en-US")}
    {tab === "metrics" ? "metric names" : "label names"}
  </div>
</aside>
