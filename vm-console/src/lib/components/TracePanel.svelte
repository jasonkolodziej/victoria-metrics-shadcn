<script lang="ts">
  import TraceNode from "./TraceNode.svelte";
  import type { TraceSpan } from "$lib/vm/types.js";

  interface Props {
    trace: TraceSpan | null;
  }

  let { trace }: Props = $props();

  function formatMs(ms: number): string {
    return ms < 1000 ? `${Math.round(ms)}ms` : `${(ms / 1000).toFixed(2)}s`;
  }
</script>

{#if trace}
  <div class="bg-card border-border overflow-hidden rounded-md border">
    <div
      class="border-border flex items-center justify-between border-b px-3 py-2"
    >
      <p class="eyebrow">Execution trace</p>
      <span class="text-muted-foreground font-mono text-[11px] tabular"
        >total {formatMs(trace.duration_msec)}</span
      >
    </div>
    <ul class="max-h-96 overflow-y-auto p-2">
      <TraceNode span={trace} />
    </ul>
  </div>
{/if}
