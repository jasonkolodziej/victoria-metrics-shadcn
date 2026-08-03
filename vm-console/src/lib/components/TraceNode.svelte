<script lang="ts">
  import TraceNode from "./TraceNode.svelte";
  import type { TraceSpan } from "$lib/vm/types.js";
  import { ChevronDown, ChevronRight } from "@lucide/svelte";

  interface Props {
    span: TraceSpan;
    depth?: number;
  }

  let { span, depth = 0 }: Props = $props();
  let open = $state(depth < 2);
  const hasChildren = $derived(!!span.children?.length);

  function formatMs(ms: number): string {
    if (ms < 1) return `${Math.round(ms * 1000)}µs`;
    if (ms < 1000) return `${ms < 10 ? ms.toFixed(2) : Math.round(ms)}ms`;
    return `${(ms / 1000).toFixed(2)}s`;
  }
</script>

<li>
  <div
    class="flex items-start gap-1.5 py-0.5"
    style="padding-left: {depth * 0.9}rem"
  >
    {#if hasChildren}
      <button
        class="text-muted-foreground hover:text-foreground mt-0.5 shrink-0"
        aria-label={open ? "Collapse span" : "Expand span"}
        onclick={() => (open = !open)}
      >
        {#if open}
          <ChevronDown class="h-3 w-3" />
        {:else}
          <ChevronRight class="h-3 w-3" />
        {/if}
      </button>
    {:else}
      <span class="w-3 shrink-0"></span>
    {/if}
    <span class="text-primary shrink-0 font-mono text-[11px] tabular"
      >{formatMs(span.duration_msec)}</span
    >
    <span
      class="text-foreground/90 min-w-0 flex-1 font-mono text-[11.5px] wrap-break-word"
      >{span.message}</span
    >
  </div>
  {#if hasChildren && open}
    <ul>
      {#each span.children ?? [] as child, i (i)}
        <TraceNode span={child} depth={depth + 1} />
      {/each}
    </ul>
  {/if}
</li>
