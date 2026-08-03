<script lang="ts">
  import { Button } from "$lib/components/ui/button/index.js";
  import QueryEditor from "$lib/components/QueryEditor.svelte";
  import * as Popover from "$lib/components/ui/popover/index.js";
  import type { ConsoleState } from "$lib/state/console.svelte.js";
  import {
    CornerDownLeft,
    GitBranch,
    History,
    Loader2,
    Play,
  } from "@lucide/svelte";

  interface Props {
    session: ConsoleState;
  }

  let { session }: Props = $props();
  let historyOpen = $state(false);
</script>

<div class="flex flex-col gap-2">
  <div class="flex items-start gap-2">
    <div class="relative flex-1">
      <QueryEditor
        bind:value={session.expr}
        onRun={() => session.run()}
        startMs={session.startMs}
        endMs={session.endMs}
        placeholder={"sum(rate(vm_http_requests_total[5m])) by (path)"}
      />
      <div
        class="text-muted-foreground pointer-events-none absolute right-3 bottom-2 flex items-center gap-1 font-mono text-[10px]"
      >
        <CornerDownLeft class="h-3 w-3" />
        <span>to run</span>
      </div>
    </div>

    <div class="flex flex-col gap-2">
      <Button
        onclick={() => session.run()}
        disabled={session.loading}
        class="w-28 gap-1.5"
      >
        {#if session.loading}
          <Loader2 class="h-3.5 w-3.5 animate-spin" />
          Running
        {:else}
          <Play class="h-3.5 w-3.5" />
          Run
        {/if}
      </Button>

      <Button
        variant={session.traceEnabled ? "default" : "outline"}
        class="w-28 gap-1.5"
        aria-pressed={session.traceEnabled}
        onclick={() => (session.traceEnabled = !session.traceEnabled)}
      >
        <GitBranch class="h-3.5 w-3.5" />
        Trace
      </Button>

      <Popover.Root bind:open={historyOpen}>
        <Popover.Trigger>
          {#snippet child({ props })}
            <Button
              {...props}
              variant="outline"
              class="w-28 gap-1.5"
              disabled={!session.history.length}
            >
              <History class="h-3.5 w-3.5" />
              History
            </Button>
          {/snippet}
        </Popover.Trigger>
        <Popover.Content class="w-[32rem] p-0" align="end">
          <p class="eyebrow border-border border-b px-3 py-2">
            Queries run this session
          </p>
          <ul class="max-h-72 overflow-y-auto">
            {#each session.history as entry (entry)}
              <li>
                <button
                  class="hover:bg-muted block w-full px-3 py-2 text-left font-mono text-xs break-all"
                  onclick={() => {
                    session.expr = entry;
                    historyOpen = false;
                    void session.run();
                  }}
                >
                  {entry}
                </button>
              </li>
            {/each}
          </ul>
        </Popover.Content>
      </Popover.Root>
    </div>
  </div>

  {#if session.stale}
    <p class="text-muted-foreground font-mono text-[11px]">
      Showing the previous result. Press Enter to run the edited expression.
    </p>
  {/if}
</div>
