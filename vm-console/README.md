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
| vmalert           | http://localhost:8880   | rule engine; backs the console's Alerts tab |

`vmagent` scrapes VictoriaMetrics and itself every 10s, so the console has
real data within a few seconds of starting — every example query on the empty
state resolves against those targets. Point it at your own services by editing
`docker/scrape.yml`; it takes standard Prometheus scrape config.

### Optional: fronted by vmauth

```bash
docker compose --profile auth up -d --build
```

This adds two more services on top of the default ones above — it doesn't
replace anything, and the plain console keeps working exactly as before:

| Service                | URL                     | What it is                                        |
| ----------------------- | ----------------------- | -------------------------------------------------- |
| Victoria Console (auth) | http://localhost:3001   | the same app, reached through vmauth instead       |
| vmauth                  | http://localhost:8427   | fronts VictoriaMetrics + vmalert with per-user auth |

See [Notes on the compose file](#notes-on-the-compose-file) for how the
routing works.

Data survives `docker compose down` in the `vm-data` volume. To start clean:

```bash
docker compose down -v
```

### Notes on the compose file

- **`VM_URL=http://victoriametrics:8428`** — the service name, not localhost.
  The browser never resolves it; only the console's server process does, which
  is the whole point of the proxy.
- **`vmauth` and `console-auth` are both tagged `profiles: ['auth']`,** so
  `docker compose up` (no flags) never starts them — the default `console`
  service is unaffected and talks to VictoriaMetrics/vmalert directly, exactly
  as before vmauth existed in this file. Passing `--profile auth` starts them
  *in addition to* the default services, on their own container names and
  ports (`vm-console-auth` on 3001, `vm-auth` on 8427), so nothing about the
  default path changes or conflicts.
- **`console-auth`'s `VM_URL` / `VMALERT_URL` both point at
  `http://vmauth:8427`.** `docker/vmauth.yml` defines two users, `console-vm`
  and `console-vmalert`, each mapped to one backend via `url_prefix`; vmauth
  picks the backend by which Basic Auth credentials the request carries, so
  the two proxies can share one port even though both request `/api/v1/...`
  paths. `VM_BASIC_AUTH` / `VMALERT_BASIC_AUTH` on `console-auth` carry those
  credentials. They're throwaway local-dev passwords, committed on purpose —
  don't reuse them anywhere that isn't `docker compose up` on your laptop.
- **Versions are pinned to the v1.136 LTS line.** Avoid v1.140.0, v1.136.4 and
  v1.122.19 — those mis-evaluate operand order in binary expressions.
- **`-search.latencyOffset=10s`.** VictoriaMetrics defaults to 30s, which hides
  the newest samples and makes a live dashboard look stalled. Matching it to
  the scrape interval fixes that.
- **`ORIGIN`** tells adapter-node where the browser reaches the app. Change it
  if you publish on another host or port.

### What's actually collected out of the box

`docker/scrape.yml` gives `vmagent` five jobs, each scraped every 10s and
labeled `component=storage/agent/alerting/auth/host` plus the global
`env=local`. Every target also carries the standard Go (`go_*`) and process
(`process_*`) metrics on top of what's listed below.

| Job | Target | What it exposes |
| --- | --- | --- |
| `victoriametrics` | `victoriametrics:8428` | Storage/ingestion metrics — `vm_data_size_bytes`, `vm_rows_inserted_total`, `vm_http_request_errors_total`, `vm_indexdb_items_dropped_total`, `vm_concurrent_insert_current`, etc. |
| `vmagent` | `vmagent:8429` | Scrape-pipeline metrics — `vm_promscrape_scrapes_failed_total`, `vm_promscrape_scrape_pool_targets`, `vmagent_remotewrite_*`, `vm_persistentqueue_*`, `vmagent_hourly_series_limit_*` |
| `vmalert` | `vmalert:8880` | Rule-engine metrics — `vmalert_config_last_reload_successful`, `vmalert_alerting_rules_errors_total`, `vmalert_iteration_*`, `vmalert_remotewrite_*` |
| `vmauth` | `vmauth:8427` | Auth/routing metrics — `vmauth_concurrent_requests_limit_reached_total`, `vmauth_user_request_errors_total`, `vmauth_http_request_errors_total`. Only resolves when the `auth` profile is running; otherwise it's just a down target vmagent retries harmlessly. |
| `node` | `node-exporter:9100` | Host OS/hardware metrics — CPU, memory, disk, network (the Docker VM's, not the Mac's, on macOS) |

**Derived series, not scraped.** None of `docker/alerts/rules/*.yml` define
recording rules — only `alert:` conditions — so the only extra series vmalert
produces are the standard `ALERTS` / `ALERTS_FOR_STATE`, written back through
`vmagent:8429`'s remote-write when an alert actually fires.

**Not collected:**

- `alertmanager:9093` runs but has no scrape job — it's wired up purely as
  vmalert's notification sink, not scraped for its own metrics.
- The console app itself isn't scraped.
- `alerts-cluster.yml`, `alerts-vmanomaly.yml` and `alerts-vmbackupmanager.yml`
  reference metrics from `vmselect`/`vminsert`/`vmstorage`/`vmsingle`/
  `vmanomaly`/`vmbackupmanager` — none of those services exist in this compose
  file, so those rules simply sit idle (no matching series) unless you deploy
  them separately. `alerts-vmauth.yml` is the closest to being live — it needs
  nothing deployed separately, just `docker compose --profile auth up`.

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

The Alerts tab is optional and separately configured: set `VMALERT_URL` to
wherever vmalert's HTTP API lives (`http://localhost:8880` for a local
instance). Leave it unset if you don't run vmalert.

`docker/vmauth.yml` is a working example of the "Behind vmauth" row above —
one vmauth instance fronting both VictoriaMetrics and vmalert, selecting the
backend per-user rather than per-path. Outside Docker, point `VM_URL`/
`VMALERT_URL` at your own vmauth's `http://host:8427` and set
`VM_BASIC_AUTH`/`VMALERT_BASIC_AUTH` (or the bearer-token variants) to match
whatever `users:` entry you've configured there.

---

## How it is put together

```
docker-compose.yml                VictoriaMetrics + vmagent + vmalert + console
                                   (+ vmauth + console-auth, `auth` profile)
Dockerfile                        multi-stage, non-root, healthchecked
docker/scrape.yml                 what vmagent collects
docker/vmauth.yml                 per-user routing: console-vm, console-vmalert
src/
  routes/
    api/vm/[...path]/+server.ts       read-only proxy to VictoriaMetrics
    api/vmalert/[...path]/+server.ts  read-only proxy to vmalert
    +layout.svelte                chrome, fonts, light/dark
    +page.svelte                  console layout, URL state sync
  lib/
    vm/
      types.ts                    API response shapes
      client.ts                   typed client, talks to the proxy
      format.ts                   SI values, axis ticks, auto step
      metricsql.ts                CodeMirror language + completion source
    vmalert/
      types.ts                    vmalert API response shapes
      client.ts                   typed client, talks to its proxy
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
      AlertsView.svelte           vmalert rule groups + active alerts
```

**Everything goes through a proxy.** The browser never talks to
VictoriaMetrics or vmalert directly. Credentials stay on the server, CORS
never comes up, and only a small allowlist of endpoints are reachable on each
— neither proxy is an open forwarder:

- `api/vm`: `query` · `query_range` · `series` · `labels` ·
  `label/<name>/values` · `metadata` · `status/tsdb` · `status/active_queries`
  · `status/top_queries`
- `api/vmalert`: `groups` · `alerts` · `rule`

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
- **vmalert integration.** A second read-only proxy, `api/vmalert/[...path]`,
  reaches vmalert's own HTTP API (`groups`, `alerts`, `rule`) the same way
  `api/vm` reaches VictoriaMetrics — server-side only, small allowlist,
  configured via `VMALERT_URL` (+ optional `VMALERT_BEARER_TOKEN` /
  `VMALERT_BASIC_AUTH`, `VMALERT_TIMEOUT_MS`). The new "Alerts" tab
  (`AlertsView.svelte`) lists every rule group with each rule's health, last
  evaluation time, and any currently firing/pending instances, and a play
  button on each rule drops its expression straight into the query editor.
- **vmauth in front of both, opt-in.** `docker compose --profile auth up`
  adds `vmauth` (`docker/vmauth.yml`) and a second console, `console-auth`
  (port 3001), whose `VM_URL`/`VMALERT_URL` point at vmauth instead of the
  bare services. One vmauth port, two `users:` entries (`console-vm`,
  `console-vmalert`), routed by Basic Auth credentials rather than by path —
  a working local example of the "Behind vmauth" deployment row above. The
  default `console`/`docker compose up` is untouched by any of this.
