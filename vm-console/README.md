# Victoria Console

A query console for VictoriaMetrics. Write MetricsQL, see the result, and
understand the shape of the data behind it.

SvelteKit 2 · Svelte 5 (runes) · TypeScript (strict) · Tailwind v4 ·
shadcn-svelte.

![victoria metrics diagram](https://docs.victoriametrics.com/victoriametrics/README-components.webp)

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

### What's actually collected out of the box

`docker/scrape.yml` gives `vmagent` three jobs, each scraped every 10s and
labeled `component=storage/agent/alerting` plus the global `env=local`. Every
target also carries the standard Go (`go_*`) and process (`process_*`)
metrics on top of what's listed below.

| Job | Target | What it exposes |
| --- | --- | --- |
| `victoriametrics` | `victoriametrics:8428` | Storage/ingestion metrics — `vm_data_size_bytes`, `vm_rows_inserted_total`, `vm_http_request_errors_total`, `vm_indexdb_items_dropped_total`, `vm_concurrent_insert_current`, etc. |
| `vmagent` | `vmagent:8429` | Scrape-pipeline metrics — `vm_promscrape_scrapes_failed_total`, `vm_promscrape_scrape_pool_targets`, `vmagent_remotewrite_*`, `vm_persistentqueue_*`, `vmagent_hourly_series_limit_*` |
| `vmalert` | `vmalert:8880` | Rule-engine metrics — `vmalert_config_last_reload_successful`, `vmalert_alerting_rules_errors_total`, `vmalert_iteration_*`, `vmalert_remotewrite_*` |

**Derived series, not scraped.** None of `docker/alerts/rules/*.yml` define
recording rules — only `alert:` conditions — so the only extra series vmalert
produces are the standard `ALERTS` / `ALERTS_FOR_STATE`, written back through
`vmagent:8429`'s remote-write when an alert actually fires.

**Not collected:**

- `alertmanager:9093` runs but has no scrape job — it's wired up purely as
  vmalert's notification sink, not scraped for its own metrics.
- The console app itself isn't scraped.
- `alerts-cluster.yml`, `alerts-vmanomaly.yml`, `alerts-vmauth.yml` and
  `alerts-vmbackupmanager.yml` reference metrics from `vmselect`/`vminsert`/
  `vmstorage`/`vmsingle`/`vmauth`/`vmanomaly`/`vmbackupmanager` — none of
  those services exist in this compose file, so those rules simply sit idle
  (no matching series) unless you deploy them separately.

This is also why the README's example queries (`vm_http_requests_total`,
`vm_data_size_bytes`, `vm_rows_inserted_total`) resolve immediately on a fresh
`docker compose up`.

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
    +page.svelte                  console layout, URL state sync
  lib/
    vm/
      types.ts                    API response shapes
      client.ts                   typed client, talks to the proxy
      format.ts                   SI values, axis ticks, auto step
      metricsql.ts                CodeMirror language + completion source
    state/
      console.svelte.ts           ConsoleState — the whole session
    components/
      MetricRail.svelte           metric and label browser
      QueryBar.svelte             editor, run, trace toggle, history
      QueryEditor.svelte          CodeMirror 6, MetricsQL autocomplete
      RangeControl.svelte         window, step, refresh
      PaperPlot.svelte            the plot
      ResultTable.svelte          per-series stats
      StatusStrip.svelte          timing, counts, errors
      TracePanel.svelte           `trace=1` execution tree
      TraceNode.svelte            one collapsible span in that tree
      CardinalityView.svelte      /status/tsdb cardinality explorer
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

## Recently added

- **MetricsQL autocomplete.** `QueryEditor.svelte` replaces the plain textarea
  with CodeMirror 6. `lib/vm/metricsql.ts` supplies a lightweight tokenizer for
  syntax colour and a `@codemirror/autocomplete` source that mixes static
  aggregators/functions with metric, label and label-value names fetched live
  from VictoriaMetrics, with light TTL caching per editor instance.
- **Cardinality view.** A "Cardinality" tab next to the query view renders
  `client.tsdbStatus()` — series by metric name, by label name, label values
  by label name, and series by label=value pair, the same data VM's own
  cardinality explorer uses.
- **URL state.** `+page.svelte` serialises the executed expression, mode and
  window into the query string (`?q=…&mode=…&range=…&end=…&step=…&refresh=…`),
  so results are shareable and the browser's back/forward buttons step through
  the queries that were actually run.
- **Query tracing.** A "Trace" toggle in `QueryBar` requests `trace=1`;
  VictoriaMetrics' execution tree renders in `TracePanel`/`TraceNode` as a
  collapsible list of spans with per-step timing.
