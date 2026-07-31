<script lang="ts">
  import type { ConsoleState } from "$lib/state/console.svelte.js";
  import { formatDuration, formatTimestamp } from "$lib/vm/format.js";
  import { AlertTriangle, CircleAlert } from "@lucide/svelte";

  interface Props {
    session: ConsoleState;
  }

  let { session: state }: Props = $props();
</script>

{#if state.error}
  <div
    class="border-destructive/40 bg-destructive/5 flex items-start gap-2 rounded-md border px-3 py-2"
    role="alert"
  >
    <CircleAlert class="text-destructive mt-0.5 h-4 w-4 shrink-0" />
    <div class="min-w-0">
      <p class="text-destructive text-sm font-medium">The query did not run</p>
      <p class="text-foreground/80 mt-0.5 font-mono text-xs break-words">
        {state.error}
      </p>
    </div>
  </div>
{:else if state.ranAt}
  <div
    class="text-muted-foreground flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-xs"
  >
    <span class="tabular">
      {state.series.length.toLocaleString("en-US")} series
    </span>
    <span class="tabular">{formatDuration(state.elapsedMs)}</span>
    <span>{state.resultType}</span>
    <span class="tabular">ran {formatTimestamp(state.ranAt)}</span>
  </div>
{/if}

{#each state.warnings as warning (warning)}
  <div class="text-muted-foreground flex items-start gap-2 font-mono text-xs">
    <AlertTriangle class="mt-0.5 h-3.5 w-3.5 shrink-0" />
    <span>{warning}</span>
  </div>
{/each}
