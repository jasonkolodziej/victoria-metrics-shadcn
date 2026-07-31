<script lang="ts">
  import "../app.css";
  import { ModeWatcher, toggleMode } from "mode-watcher";
  import { Button } from "$lib/components/ui/button/index.js";
  import { Moon, Sun } from "@lucide/svelte";

  let { children } = $props();
</script>

<svelte:head>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link
    rel="preconnect"
    href="https://fonts.gstatic.com"
    crossorigin="anonymous"
  />
  <link
    rel="stylesheet"
    href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&family=IBM+Plex+Sans:wght@400;500;600&family=Space+Grotesk:wght@500;600;700&display=swap"
  />
</svelte:head>

<ModeWatcher />

<div class="flex h-screen flex-col overflow-hidden">
  <header
    class="border-border bg-card flex shrink-0 items-center justify-between gap-4 border-b px-4 py-2"
  >
    <div class="flex items-baseline gap-2.5">
      <!-- The mark is a two-stroke pen trace: the wordmark is drawn in the same
			     ink the plot uses, so the identity and the data share a palette. -->
      <svg
        width="20"
        height="14"
        viewBox="0 0 20 14"
        aria-hidden="true"
        class="shrink-0"
      >
        <path
          d="M1 10 L5 4 L9 11 L13 2 L19 8"
          fill="none"
          stroke="var(--pen-1)"
          stroke-width="1.75"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
      </svg>
      <span class="font-display text-[0.9375rem] font-semibold tracking-tight">
        Victoria Console
      </span>
      <span class="eyebrow hidden sm:inline">MetricsQL</span>
    </div>

    <Button
      variant="ghost"
      size="sm"
      onclick={toggleMode}
      aria-label="Switch between light and dark"
      class="h-7 w-7 p-0"
    >
      <Sun class="hidden h-4 w-4 dark:block" />
      <Moon class="h-4 w-4 dark:hidden" />
    </Button>
  </header>

  <main class="min-h-0 flex-1">
    {@render children?.()}
  </main>
</div>
