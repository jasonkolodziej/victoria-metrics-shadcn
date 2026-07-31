<script lang="ts">
  import { Button } from "$lib/components/ui/button/index.js";
  import * as Select from "$lib/components/ui/select/index.js";
  import {
    RANGE_PRESETS,
    REFRESH_OPTIONS,
    type ConsoleState,
  } from "$lib/state/console.svelte.js";
  import { formatStep, formatTimestamp } from "$lib/vm/format.js";
  import { ChevronLeft, ChevronRight, Radio } from "@lucide/svelte";

  interface Props {
    session: ConsoleState;
  }

  let { session: state }: Props = $props();

  const refreshLabel = $derived(
    REFRESH_OPTIONS.find((o) => o.ms === state.refreshMs)?.label ?? "Off",
  );
</script>

<div class="flex flex-wrap items-center gap-2">
  <div class="border-input flex overflow-hidden rounded-md border">
    {#each RANGE_PRESETS as preset (preset.ms)}
      <button
        class="hover:bg-muted px-2.5 py-1 font-mono text-xs transition-colors
					{state.rangeMs === preset.ms
          ? 'bg-primary text-primary-foreground hover:bg-primary'
          : ''}"
        aria-pressed={state.rangeMs === preset.ms}
        onclick={() => {
          state.setRange(preset.ms);
          void state.run();
        }}
      >
        {preset.label}
      </button>
    {/each}
  </div>

  <div class="border-input flex overflow-hidden rounded-md border">
    <Button
      variant="ghost"
      size="sm"
      class="h-7 rounded-none px-1.5"
      aria-label="Move window earlier"
      onclick={() => state.shift(-1)}
    >
      <ChevronLeft class="h-3.5 w-3.5" />
    </Button>
    <Button
      variant="ghost"
      size="sm"
      class="h-7 rounded-none px-1.5"
      aria-label="Move window later"
      onclick={() => state.shift(1)}
    >
      <ChevronRight class="h-3.5 w-3.5" />
    </Button>
  </div>

  {#if state.live}
    <span
      class="text-muted-foreground flex items-center gap-1.5 font-mono text-xs"
    >
      <Radio class="text-primary h-3 w-3" />
      ends now
    </span>
  {:else}
    <Button
      variant="outline"
      size="sm"
      class="h-7 gap-1.5 font-mono text-xs"
      onclick={() => state.resume()}
    >
      <span class="tabular">ends {formatTimestamp(state.endMs)}</span>
      <span class="text-primary">· back to now</span>
    </Button>
  {/if}

  <Select.Root
    type="single"
    value={String(state.refreshMs)}
    onValueChange={(v) => {
      state.refreshMs = Number(v);
    }}
  >
    <Select.Trigger class="h-7 w-[8.5rem] font-mono text-xs">
      Refresh {refreshLabel}
    </Select.Trigger>
    <Select.Content>
      {#each REFRESH_OPTIONS as option (option.ms)}
        <Select.Item value={String(option.ms)} label={option.label}>
          {option.label}
        </Select.Item>
      {/each}
    </Select.Content>
  </Select.Root>

  {#if state.mode === "range"}
    <span class="text-muted-foreground font-mono text-xs tabular">
      step {formatStep(state.stepSec)}{state.stepOverride ? "" : " (auto)"}
    </span>
  {/if}
</div>
