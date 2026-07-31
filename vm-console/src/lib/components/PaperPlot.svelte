<script lang="ts">
  import {
    formatValue,
    niceTicks,
    seriesLabel,
    timeFormatter,
  } from "$lib/vm/format.js";
  import type { PlotSeries } from "$lib/vm/types.js";

  interface Props {
    series: PlotSeries[];
    startMs: number;
    endMs: number;
    stepSec: number;
    loading?: boolean;
    hidden?: Set<string>;
    onzoom?: (startMs: number, endMs: number) => void;
  }

  let {
    series,
    startMs,
    endMs,
    stepSec,
    loading = false,
    hidden = new Set<string>(),
    onzoom,
  }: Props = $props();

  const PAD = { top: 12, right: 16, bottom: 26, left: 62 };
  const HEIGHT = 330;

  let width = $state(880);
  let cursorX = $state<number | null>(null);
  let dragFrom = $state<number | null>(null);
  let dragTo = $state<number | null>(null);

  const innerW = $derived(Math.max(10, width - PAD.left - PAD.right));
  const innerH = HEIGHT - PAD.top - PAD.bottom;
  const spanMs = $derived(Math.max(1, endMs - startMs));
  const visible = $derived(series.filter((s) => !hidden.has(s.id)));
  const fmtTime = $derived(timeFormatter(spanMs));

  const yDomain = $derived.by(() => {
    let min = Infinity;
    let max = -Infinity;
    for (const s of visible) {
      for (const p of s.points) {
        if (p.v < min) min = p.v;
        if (p.v > max) max = p.v;
      }
    }
    if (!Number.isFinite(min) || !Number.isFinite(max))
      return { min: 0, max: 1 };
    if (min === max)
      return {
        min: min - Math.abs(min || 1) / 2,
        max: max + Math.abs(max || 1) / 2,
      };
    // Breathing room above and below so strokes never graze the frame.
    const pad = (max - min) * 0.08;
    return { min: min - pad, max: max + pad };
  });

  const yTicks = $derived(niceTicks(yDomain.min, yDomain.max, 5));
  const xTicks = $derived.by(() => {
    const count = Math.max(2, Math.min(8, Math.floor(innerW / 110)));
    return Array.from(
      { length: count + 1 },
      (_, i) => startMs + (spanMs * i) / count,
    );
  });

  function xOf(t: number) {
    return PAD.left + ((t - startMs) / spanMs) * innerW;
  }

  function yOf(v: number) {
    const { min, max } = yDomain;
    const ratio = (v - min) / (max - min || 1);
    return PAD.top + (1 - ratio) * innerH;
  }

  function tOf(px: number) {
    return startMs + ((px - PAD.left) / innerW) * spanMs;
  }

  /** Break the line wherever samples are missing, rather than drawing a lie
   *  straight across the gap. */
  const gapMs = $derived(stepSec * 1000 * 2.5);

  function pathFor(s: PlotSeries): string {
    let d = "";
    let prevT: number | null = null;
    for (const p of s.points) {
      const command = prevT === null || p.t - prevT > gapMs ? "M" : "L";
      d += `${command}${xOf(p.t).toFixed(2)},${yOf(p.v).toFixed(2)}`;
      prevT = p.t;
    }
    return d;
  }

  /** Sample nearest the cursor for each visible series, for the readout row. */
  const readout = $derived.by(() => {
    if (cursorX === null) return null;
    const t = tOf(cursorX);
    const rows = visible
      .map((s) => {
        let best: { t: number; v: number } | null = null;
        let bestGap = Infinity;
        for (const p of s.points) {
          const gap = Math.abs(p.t - t);
          if (gap < bestGap) {
            bestGap = gap;
            best = p;
          }
        }
        return best && bestGap <= gapMs ? { series: s, point: best } : null;
      })
      .filter(
        (r): r is { series: PlotSeries; point: { t: number; v: number } } =>
          r !== null,
      )
      .sort((a, b) => b.point.v - a.point.v);
    return { t, rows };
  });

  function onPointerMove(event: PointerEvent) {
    const target = event.currentTarget as SVGSVGElement;
    const rect = target.getBoundingClientRect();
    // The SVG scales to its container, so map client pixels back to viewBox units.
    const scale = rect.width ? width / rect.width : 1;
    const x = (event.clientX - rect.left) * scale;
    cursorX = Math.max(PAD.left, Math.min(PAD.left + innerW, x));
    if (dragFrom !== null) dragTo = cursorX;
  }

  function onPointerDown(event: PointerEvent) {
    if (event.button !== 0) return;
    (event.currentTarget as Element).setPointerCapture(event.pointerId);
    dragFrom = cursorX;
    dragTo = cursorX;
  }

  function onPointerUp() {
    if (
      dragFrom !== null &&
      dragTo !== null &&
      Math.abs(dragTo - dragFrom) > 6
    ) {
      const [a, b] = [tOf(dragFrom), tOf(dragTo)].sort((x, y) => x - y);
      onzoom?.(a, b);
    }
    dragFrom = null;
    dragTo = null;
  }

  function onKeyDown(event: KeyboardEvent) {
    const stride = event.shiftKey ? 20 : 4;
    if (event.key === "ArrowRight") {
      event.preventDefault();
      cursorX = Math.min(PAD.left + innerW, (cursorX ?? PAD.left) + stride);
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      cursorX = Math.max(PAD.left, (cursorX ?? PAD.left + innerW) - stride);
    } else if (event.key === "Escape") {
      cursorX = null;
    }
  }

  const selection = $derived(
    dragFrom !== null && dragTo !== null
      ? { x: Math.min(dragFrom, dragTo), w: Math.abs(dragTo - dragFrom) }
      : null,
  );
</script>

<div class="bg-card border-border overflow-hidden rounded-md border">
  <!-- The cursor readout lives here, above the plot, so values never jump
	     around under the pointer the way a floating tooltip does. -->
  <div
    class="border-border flex min-h-[2.25rem] items-center gap-4 overflow-x-auto border-b px-3 py-1.5"
  >
    {#if readout && readout.rows.length}
      <span class="text-muted-foreground shrink-0 font-mono text-xs tabular">
        {fmtTime(readout.t)}
      </span>
      <div class="flex items-center gap-3.5">
        {#each readout.rows.slice(0, 8) as row (row.series.id)}
          <span class="flex shrink-0 items-center gap-1.5 font-mono text-xs">
            <span
              class="h-2 w-2 shrink-0 rounded-full"
              style="background: var(--pen-{row.series.pen + 1})"
            ></span>
            <span class="tabular">{formatValue(row.point.v)}</span>
          </span>
        {/each}
        {#if readout.rows.length > 8}
          <span class="text-muted-foreground shrink-0 font-mono text-xs">
            +{readout.rows.length - 8}
          </span>
        {/if}
      </div>
    {:else}
      <span class="text-muted-foreground font-mono text-xs">
        Move across the plot to read values · drag to zoom
      </span>
    {/if}
  </div>

  <div bind:clientWidth={width} class="bg-paper relative">
    {#if loading}
      <div
        class="bg-primary absolute top-0 left-0 z-10 h-0.5 w-full origin-left animate-pulse"
      ></div>
    {/if}

    {#if !visible.length && !loading}
      <div
        class="text-muted-foreground flex flex-col items-center justify-center gap-1 py-20 text-center"
        style="height: {HEIGHT}px"
      >
        <p class="font-display text-sm">No series in this window</p>
        <p class="max-w-sm font-mono text-xs">
          Widen the time range, or check the selector against Metrics in the
          left rail.
        </p>
      </div>
    {:else}
      <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
      <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
      <svg
        role="application"
        aria-label="Time series plot. Use arrow keys to move the cursor."
        tabindex="0"
        viewBox="0 0 {width} {HEIGHT}"
        height={HEIGHT}
        class="block w-full cursor-crosshair touch-none select-none"
        onpointermove={onPointerMove}
        onpointerleave={() => {
          cursorX = null;
          dragFrom = null;
          dragTo = null;
        }}
        onpointerdown={onPointerDown}
        onpointerup={onPointerUp}
        onkeydown={onKeyDown}
      >
        <defs>
          <clipPath id="vm-plot-area">
            <rect x={PAD.left} y={PAD.top} width={innerW} height={innerH} />
          </clipPath>
        </defs>

        <!-- Horizontal gridlines only. Vertical rules would fight the data. -->
        {#each yTicks as tick (tick)}
          {@const y = yOf(tick)}
          {#if y >= PAD.top - 1 && y <= PAD.top + innerH + 1}
            <line
              x1={PAD.left}
              x2={PAD.left + innerW}
              y1={y}
              y2={y}
              stroke="var(--plot-grid)"
              stroke-width="1"
            />
            <text
              x={PAD.left - 8}
              y={y + 3.5}
              text-anchor="end"
              class="tabular"
              font-size="10.5"
              font-family="var(--font-mono)"
              fill="var(--muted-foreground)"
            >
              {formatValue(tick)}
            </text>
          {/if}
        {/each}

        <line
          x1={PAD.left}
          x2={PAD.left + innerW}
          y1={PAD.top + innerH}
          y2={PAD.top + innerH}
          stroke="var(--plot-axis)"
          stroke-width="1"
        />

        {#each xTicks as tick, i (i)}
          <text
            x={xOf(tick)}
            y={HEIGHT - 8}
            text-anchor={i === 0
              ? "start"
              : i === xTicks.length - 1
                ? "end"
                : "middle"}
            class="tabular"
            font-size="10.5"
            font-family="var(--font-mono)"
            fill="var(--muted-foreground)"
          >
            {fmtTime(tick)}
          </text>
        {/each}

        <g clip-path="url(#vm-plot-area)">
          {#each visible as s (s.id)}
            <path
              d={pathFor(s)}
              fill="none"
              stroke="var(--pen-{s.pen + 1})"
              stroke-width="1.5"
              stroke-linecap="round"
              stroke-linejoin="round"
              pathLength="1"
              class="pen"
            />
          {/each}
        </g>

        {#if selection}
          <rect
            x={selection.x}
            y={PAD.top}
            width={selection.w}
            height={innerH}
            fill="var(--plot-cursor)"
            opacity="0.1"
          />
        {/if}

        {#if cursorX !== null && !selection}
          <line
            x1={cursorX}
            x2={cursorX}
            y1={PAD.top}
            y2={PAD.top + innerH}
            stroke="var(--plot-cursor)"
            stroke-width="1"
            stroke-dasharray="3 3"
          />
          {#if readout}
            {#each readout.rows as row (row.series.id)}
              <circle
                cx={xOf(row.point.t)}
                cy={yOf(row.point.v)}
                r="3"
                fill="var(--plot-paper)"
                stroke="var(--pen-{row.series.pen + 1})"
                stroke-width="1.5"
              />
            {/each}
          {/if}
        {/if}
      </svg>
    {/if}
  </div>

  {#if visible.length}
    <div
      class="border-border flex flex-wrap gap-x-4 gap-y-1 border-t px-3 py-2"
    >
      {#each visible.slice(0, 12) as s (s.id)}
        <span
          class="flex items-center gap-1.5 font-mono text-[11px]"
          title={seriesLabel({ __name__: s.name, ...s.labels })}
        >
          <span
            class="h-0.5 w-3 shrink-0 rounded-full"
            style="background: var(--pen-{s.pen + 1})"
          ></span>
          <span class="text-muted-foreground max-w-[22rem] truncate"
            >{seriesLabel({ __name__: s.name, ...s.labels })}</span
          >
        </span>
      {/each}
      {#if visible.length > 12}
        <span class="text-muted-foreground font-mono text-[11px]">
          +{visible.length - 12} more in the table below
        </span>
      {/if}
    </div>
  {/if}
</div>

<style>
  /* Pens draw themselves in once, like a chart recorder starting up.
	   The global reduced-motion rule collapses this to nothing. */
  .pen {
    animation: draw 620ms cubic-bezier(0.4, 0, 0.2, 1) both;
    stroke-dasharray: 1;
  }

  @keyframes draw {
    from {
      stroke-dashoffset: 1;
    }
    to {
      stroke-dashoffset: 0;
    }
  }
</style>
