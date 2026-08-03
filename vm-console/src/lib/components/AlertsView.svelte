<script lang="ts">
  import { Button } from "$lib/components/ui/button/index.js";
  import { VmalertClient } from "$lib/vmalert/client.js";
  import {
    VmalertError,
    type VmalertActiveAlert,
    type VmalertGroup,
  } from "$lib/vmalert/types.js";
  import { labelSetToString } from "$lib/vm/format.js";
  import { ChevronDown, ChevronRight, Loader2, Play, RefreshCw } from "@lucide/svelte";
  import { SvelteSet } from "svelte/reactivity";

  interface Props {
    /** Drop a rule's expression into the query editor and switch to it. */
    onLoadQuery: (expr: string) => void;
  }

  let { onLoadQuery }: Props = $props();

  const client = new VmalertClient();

  let groups = $state<VmalertGroup[]>([]);
  let activeAlerts = $state<VmalertActiveAlert[]>([]);
  let loading = $state(false);
  let error = $state<string | null>(null);
  let loadedOnce = $state(false);
  const collapsed = new SvelteSet<string>();

  async function load() {
    loading = true;
    error = null;
    try {
      const [g, a] = await Promise.all([client.groups(), client.alerts()]);
      groups = g;
      activeAlerts = a;
      loadedOnce = true;
    } catch (err) {
      error = err instanceof VmalertError ? err.message : "Could not reach vmalert.";
    } finally {
      loading = false;
    }
  }

  $effect(() => {
    if (!loadedOnce) void load();
  });

  const totalRules = $derived(groups.reduce((n, g) => n + g.rules.length, 0));
  const firing = $derived(activeAlerts.filter((a) => a.state === "firing").length);
  const pending = $derived(activeAlerts.filter((a) => a.state === "pending").length);

  function toggleGroup(id: string) {
    if (collapsed.has(id)) collapsed.delete(id);
    else collapsed.add(id);
  }

  function stateClass(state: string | undefined) {
    if (state === "firing") return "text-destructive";
    if (state === "pending") return "text-accent";
    return "text-muted-foreground";
  }

  function healthClass(health: string) {
    return health === "err" ? "text-destructive" : "text-muted-foreground";
  }
</script>

<div class="flex flex-col gap-4">
  <div class="flex flex-wrap items-center justify-between gap-3">
    <div
      class="text-muted-foreground flex flex-wrap gap-x-4 gap-y-1 font-mono text-xs"
    >
      <span class="tabular {firing ? 'text-destructive' : ''}">{firing} firing</span>
      <span class="tabular {pending ? 'text-accent' : ''}">{pending} pending</span>
      <span class="tabular">{groups.length} groups</span>
      <span class="tabular">{totalRules} rules</span>
    </div>
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
      <p class="text-muted-foreground mt-1 font-mono text-[11px]">
        Set VMALERT_URL in .env and restart the dev server.
      </p>
    </div>
  {:else if loading && !loadedOnce}
    <div class="bg-card border-border space-y-1.5 rounded-md border p-4">
      {#each Array(6) as _, i (i)}
        <div
          class="bg-muted h-3.5 animate-pulse rounded"
          style="width: {40 + ((i * 17) % 55)}%"
        ></div>
      {/each}
    </div>
  {:else if !groups.length}
    <p class="text-muted-foreground px-3 py-6 text-center font-mono text-xs">
      vmalert has no rule groups loaded.
    </p>
  {:else}
    <div class="flex flex-col gap-3">
      {#each groups as group (group.id)}
        <div class="bg-card border-border overflow-hidden rounded-md border">
          <button
            class="border-border hover:bg-muted/60 flex w-full items-center justify-between gap-3 border-b px-3 py-2 text-left transition-colors"
            onclick={() => toggleGroup(group.id)}
          >
            <span class="flex items-center gap-1.5">
              {#if collapsed.has(group.id)}
                <ChevronRight class="text-muted-foreground h-3.5 w-3.5" />
              {:else}
                <ChevronDown class="text-muted-foreground h-3.5 w-3.5" />
              {/if}
              <span class="font-mono text-xs font-medium">{group.name}</span>
            </span>
            <span class="text-muted-foreground font-mono text-[11px] tabular">
              {group.rules.length} rules{group.interval
                ? ` · every ${group.interval}`
                : ""}
            </span>
          </button>

          {#if !collapsed.has(group.id)}
            <table class="w-full border-collapse text-left">
              <thead>
                <tr class="border-border border-b">
                  <th class="eyebrow px-3 py-1.5">Rule</th>
                  <th class="eyebrow px-2 py-1.5">Type</th>
                  <th class="eyebrow px-2 py-1.5">Health</th>
                  <th class="eyebrow px-2 py-1.5 text-right">Last eval</th>
                  <th class="eyebrow px-2 py-1.5">Active</th>
                  <th class="w-8"></th>
                </tr>
              </thead>
              <tbody>
                {#each group.rules as rule (rule.id)}
                  <tr
                    class="border-border/60 hover:bg-muted/60 border-b transition-colors"
                  >
                    <td class="max-w-0 px-3 py-1.5">
                      <div class="truncate font-mono text-[11.5px]" title={rule.query}>
                        {rule.name}
                      </div>
                    </td>
                    <td class="px-2 py-1.5">
                      <span class="text-muted-foreground font-mono text-[11px]"
                        >{rule.type}</span
                      >
                    </td>
                    <td class="px-2 py-1.5">
                      <span class="font-mono text-[11px] {healthClass(rule.health)}"
                        >{rule.health}</span
                      >
                    </td>
                    <td
                      class="text-muted-foreground px-2 py-1.5 text-right font-mono text-[11px] tabular"
                    >
                      {rule.last_exec_duration_seconds != null
                        ? `${Math.round(rule.last_exec_duration_seconds * 1000)}ms`
                        : "—"}
                    </td>
                    <td class="px-2 py-1.5">
                      {#if rule.alerts?.length}
                        <span
                          class="font-mono text-[11px] {stateClass(rule.alerts[0].state)}"
                          title={labelSetToString(rule.alerts[0].labels)}
                        >
                          {rule.alerts.length} {rule.alerts[0].state}
                        </span>
                      {:else}
                        <span class="text-muted-foreground font-mono text-[11px]">—</span>
                      {/if}
                    </td>
                    <td class="px-2 py-1.5 text-right">
                      <button
                        class="text-muted-foreground hover:text-foreground"
                        aria-label="Load this rule's query into the editor"
                        onclick={() => onLoadQuery(rule.query)}
                      >
                        <Play class="h-3.5 w-3.5" />
                      </button>
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
