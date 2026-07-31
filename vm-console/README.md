# Victoria Console

A query console for VictoriaMetrics. Write MetricsQL, see the result, and
understand the shape of the data behind it.

SvelteKit 2 · Svelte 5 (runes) · TypeScript (strict) · Tailwind v4 ·
shadcn-svelte.

---

## Run the whole stack with Docker

```bash
# Once, on the host — the shadcn primitives are generated into the repo,
# and the image build needs them present.
npm install
npx shadcn-svelte@latest add button input textarea popover select

docker compose up -d --build
```

| Service           | URL                     | What it is                                  |
| ----------------- | ----------------------- | ------------------------------------------- |
| Victoria Console  | http://localhost:3000   | this app                                    |
| VictoriaMetrics   | http://localhost:8428   | the database (its own UI is at `/vmui`)     |
| vmagent           | http://localhost:8429   | scraper; targets at `/targets`              |

`vmagent` scrapes VictoriaMetrics and itself every 10s, so the console has
real data within a few seconds of starting — every example query on the empty
state resolves against those targets. Point it at your own services by editing
`docker/scrape.yml`; it takes standard Prometheus scrape config.

Data survives `docker compose down` in the `vm-data` volume. To start clean:

```bash
docker compose down -v
```

### Notes on the compose file

- **`VM_URL=http://victoriametrics:8428`** — the service name, not localhost.
  The browser never resolves it; only the console's server process does, which
  is the whole point of the proxy.
- **Versions are pinned to the v1.136 LTS line.** Avoid v1.140.0, v1.136.4 and
  v1.122.19 — those mis-evaluate operand order in binary expressions.
- **`-search.latencyOffset=10s`.** VictoriaMetrics defaults to 30s, which hides
  the newest samples and makes a live dashboard look stalled. Matching it to
  the scrape interval fixes that.
- **`ORIGIN`** tells adapter-node where the browser reaches the app. Change it
  if you publish on another host or port.

---

## Local development

### Without Docker

The shadcn-svelte primitives are not vendored here — they are generated into
your repo by the CLI, which is how shadcn is meant to work. Two commands and
the app runs.

```bash
npm install
npx shadcn-svelte@latest add button input textarea popover select
cp .env.example .env      # point VM_URL at your instance
npm run dev
```

To try it against real data without running anything locally, set:

```
VM_URL=https://play.victoriametrics.com/select/0/prometheus
```

### Pointing at your own instance

| Deployment  | `VM_URL`                                        |
| ----------- | ----------------------------------------------- |
| Single node | `http://localhost:8428`                         |
| Cluster     | `http://vmselect:8481/select/<tenant>/prometheus` |
| Behind vmauth | `https://vmauth.internal/select/0/prometheus` + `VM_BEARER_TOKEN` |

The tenant and API prefix live entirely in `VM_URL`, so cluster and single-node
deployments use the same build.

---

## How it is put together

```
docker-compose.yml                VictoriaMetrics + vmagent + console
Dockerfile                        multi-stage, non-root, healthchecked
docker/scrape.yml                 what vmagent collects
src/
  routes/
    api/vm/[...path]/+server.ts   read-only proxy to VictoriaMetrics
    +layout.svelte                chrome, fonts, light/dark
    +page.svelte                  console layout
  lib/
    vm/
      types.ts                    API response shapes
      client.ts                   typed client, talks to the proxy
      format.ts                   SI values, axis ticks, auto step
    state/
      console.svelte.ts           ConsoleState — the whole session
    components/
      MetricRail.svelte           metric and label browser
      QueryBar.svelte             editor, run, history
      RangeControl.svelte         window, step, refresh
      PaperPlot.svelte            the plot
      ResultTable.svelte          per-series stats
      StatusStrip.svelte          timing, counts, errors
```

**Everything goes through the proxy.** The browser never talks to
VictoriaMetrics directly. Credentials stay on the server, CORS never comes up,
and only these endpoints are reachable — it is not an open forwarder:

`query` · `query_range` · `series` · `labels` · `label/<name>/values` ·
`metadata` · `status/tsdb` · `status/active_queries` · `status/top_queries`

**One state object.** `ConsoleState` holds the expression, the window, and the
last result; everything rendered is `$derived` from it. In-flight queries carry
a generation counter, so a slow response can never overwrite a newer one.

**Steps are chosen, not guessed.** `autoStep` snaps to an interval a human
would have typed (15s, 5m, 1h…) while keeping each series under ~1400 samples.
Override it per query when you need the raw resolution.

**Gaps stay gaps.** The plot breaks a line wherever samples are more than
2.5 steps apart rather than drawing a straight line across missing data.

---

## Design notes

The palette is a chart recorder: graphite ink, a warm paper plot surface, and
six plotter-pen inks for overlaid series. Light is the designed default —
dense line data reads better as ink on paper, and it keeps the plot the
brightest thing on screen. Dark mode is a second theme, not an inversion.

Type is Space Grotesk for headers and the wordmark only, IBM Plex Sans for the
interface, and IBM Plex Mono for every number, timestamp, label set and query —
which is most of the text on the page.

The one thing to notice: **the cursor readout is pinned above the plot**, not
floating under the pointer. With forty series on screen a tooltip becomes a
wall of text that moves when you move. A fixed readout row keeps the values in
the same place, in tabular figures, so you can compare them by eye while
sweeping across the window. Drag on the plot to zoom; arrow keys move the
cursor when it has focus.

---

## Things worth adding next

- **MetricsQL autocomplete.** `MetricRail` already fetches names and labels;
  wiring them into a CodeMirror 6 editor with `@codemirror/autocomplete` is the
  natural next step and would replace the plain textarea.
- **Cardinality view.** `client.tsdbStatus()` is implemented and unused. It
  backs the same data as VM's own cardinality explorer.
- **URL state.** Serialising expression, mode and window into the query string
  would make results shareable and give back/forward for free.
- **Query tracing.** VictoriaMetrics accepts `trace=1` and returns an execution
  tree, which is the fastest way to explain a slow query.
