# 06 · Predictor: `predictor`

**Compose service `predictor`, package `@greenwave/predictor` in `predictor/`.** [WP6](../work-plan/wp6-prediction.md) · bd-nis · data 2–4 Nov (then every Monday), job 16–20 Nov, evaluation 23–27 Nov · Needs [00](00-foundation.md); the job needs [04](04-backend.md)'s tables filling · Unblocks [05](05-frontend.md) phase C. · [← Plans](README.md)

## Goal

Every 15 minutes, forecast every Aarhus segment's speed for each remaining quarter hour until local midnight, and store the run where the map's slider reads it. The method is explainable: a typical-speed profile from our own history, filled in from Traffic Stats where history is thin, plus today's deviation from that profile, fading with the horizon. A backtest shows whether it beats two baselines.

Prediction meets the live pipeline only in Postgres: it never touches MQTT.

## Read first

- [`ARCHITECTURE.md`](../../ARCHITECTURE.md) → _Historical data and prediction_.
- [WP6](../work-plan/wp6-prediction.md) → _What the recorded rows mean_: per-section speeds, `typicalSpeed` as a free baseline, `confidence`.
- [`CLAUDE.md`](../../CLAUDE.md) → _Traffic history (scheduled)_ (the old tables' UTC-without-time-zone column) and _Traffic stats (historical)_ (the export's uneven slots, ratios against 06:00, `alignBySlot`).
- [00 · Foundation](00-foundation.md) → `TrafficSegmentHistory`, `TrafficSegmentState`, `TrafficSegment`, `TrafficRoute`.
- `prisma/schema.prisma` (moved to `database/prisma/` by 00) → `TrafficHistory`, `TrafficRouteHistory`, `TrafficStats*`.

## Interfaces

| Direction | What                                                                                                                                                     |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| In        | `traffic_segment_history` (15-minute sums), `traffic_segment_state` (now), `traffic_segment` (lengths), `traffic_stats_*` and `traffic_stats_route_link` |
| Out       | `traffic_forecast_run`, `traffic_segment_forecast` (read by [05](05-frontend.md) phase C)                                                                |
| Out       | `docs/report/backtest-*.csv`                                                                                                                             |

| Variable               | Value                                |
| ---------------------- | ------------------------------------ |
| `DATABASE_URL`         | `postgres:5432` in Compose           |
| `CITY_IDS`             | `aarhus`. Keeps `load-*` cities out  |
| `FORECAST_TAU_MINUTES` | from the backtest; `60` until then   |
| `HISTORY_DAYS`         | `28`: how far back the profile looks |

## Files

```
database/prisma/schema.prisma        + TrafficStatsRouteLink, TrafficForecastRun, TrafficSegmentForecast
predictor/scripts/backfill-history.sql  (new) old Vercel rows → traffic_segment_history
predictor/scripts/link-traffic-stats-routes.ts (new) proposes the 13 live → Traffic Stats route links
predictor/
  Dockerfile  package.json  tsconfig.json
  src/
    env.ts
    slots.ts           Copenhagen quarter hours, day types, slots until midnight
    profile.ts         the profile query and the fallback order
    forecast.ts        the formula and the clamp (pure)
    run-forecast.ts    one run: read, compute, write, prune
    backtest.ts        CLI: --days N
    main.ts            croner
    slots.test.ts  profile.test.ts  forecast.test.ts
```

## Steps

### 1 · Schema (one PR on top of 00; both others review)

```prisma
/// Which Traffic Stats route a live route corresponds to. No relation: the
/// Traffic Stats import replaces its routes wholesale, which would cascade.
model TrafficStatsRouteLink {
  cityId       String
  routeId      String
  statsRouteId Int

  @@id([cityId, routeId])
  @@map("traffic_stats_route_link")
}

/// One forecast run. slotStarts are the UTC starts of the forecast quarter hours.
model TrafficForecastRun {
  id          String     @id @default(cuid())
  cityId      String
  generatedAt DateTime   @db.Timestamptz(3)
  slotStarts  DateTime[] @db.Timestamptz(3)
  tauMinutes  Int

  segments TrafficSegmentForecast[]

  @@index([cityId, generatedAt])
  @@map("traffic_forecast_run")
}

/// Per segment, lists aligned with the run's slotStarts: index i is slot i.
model TrafficSegmentForecast {
  runId             String
  cityId            String
  routeId           String
  segmentId         String
  relativeSpeedPcts Int[]
  speedsKmh         Int[]

  run TrafficForecastRun @relation(fields: [runId], references: [id], onDelete: Cascade)

  @@id([runId, cityId, routeId, segmentId])
  @@map("traffic_segment_forecast")
}
```

### 2 · Data (week 45, then every Monday)

- [ ] Import Neon's history locally, exactly as WP6 describes (`TRUNCATE`, `pg_dump --data-only` of the two old tables, then the backfill). Christian shares the Neon URL.
- [ ] `predictor/scripts/backfill-history.sql`. Mind the types: the old table's `routeId` is an integer and `recordedAt` is UTC in a column **without** a time zone; the new `bucketStart` is `timestamptz`. A single `AT TIME ZONE 'UTC'` reads the old value as UTC and yields the right instant (the double conversion in CLAUDE.md is for showing it in Danish time, which is a different question).

  ```sql
  INSERT INTO traffic_segment_history ("bucketStart", "cityId", "routeId", "segmentId", "sampleCount",
    "currentSpeedSum", "averageSpeedSum", "typicalSpeedSum", "relativeSpeedSum")
  SELECT "recordedAt" AT TIME ZONE 'UTC', 'aarhus', "routeId"::text, "segmentIdStr", 1,
         "currentSpeed", "averageSpeed", "typicalSpeed", "relativeSpeed"
  FROM traffic_history
  ON CONFLICT DO NOTHING;
  ```

  `ON CONFLICT DO NOTHING` makes a weekly re-run safe, and keeps a pipeline bucket (about 15 samples) from being overwritten by a Vercel one (1 sample).

- [ ] Once Neon passes 80% of its quota, delete exported rows older than 7 days there (WP6).
- [ ] `predictor/scripts/link-traffic-stats-routes.ts`: for each live route, propose the Traffic Stats route with the same name after normalisation (NFC, lowercase, `CW_AU_` stripped, whitespace collapsed). Live names come from `traffic_route` once the backend has run (from M2), or from the adapter's fixtures before that. Print a table of live name → proposed Traffic Stats name, write the links with `upsert`, and check the table by hand. Commit the confirmed result as `predictor/scripts/traffic-stats-route-links.sql` so a fresh database can be filled without the script.
- [ ] Look at the data before modelling: each linked route's Traffic Stats weekday curve and, as it builds up, our own per weekday. Note anything odd for the report.

### 3 · The job (week 47)

- [ ] `slots.ts`, pure and the most test-worthy file:
  - `localSlotOf(instant)`: the Copenhagen wall-clock quarter hour, 0–95, from `Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Copenhagen", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })`;
  - `dayTypeOf(instant)`: `weekday` or `weekend`, by the Copenhagen date (holidays are ignored);
  - `slotsUntilMidnight(now)`: the UTC starts of every quarter hour after `now`'s until local midnight, made by stepping 15 minutes in UTC and stopping when the local date changes. On 25 Oct 2026 (clocks back) that is a 25-hour day; on 28 Mar 2027 (clocks forward) 23 hours.
- [ ] `profile.ts`: one SQL query for P(segment, day type, slot), averaging **daily** means so each day counts once, whether a bucket holds 15 pipeline samples or 1 Vercel sample. `bucketStart` is `timestamptz`, so one `AT TIME ZONE` gives the local wall time.

  ```sql
  WITH buckets AS (
    SELECT "cityId", "routeId", "segmentId",
           ("bucketStart" AT TIME ZONE 'Europe/Copenhagen') AS local,
           "relativeSpeedSum"::float8 / "sampleCount" AS rel,
           "currentSpeedSum"::float8 / "sampleCount" AS kmh
    FROM traffic_segment_history
    WHERE "cityId" = ANY(${cityIds}) AND "bucketStart" >= ${since} AND "bucketStart" < ${until}
  ), daily AS (  -- one value per segment, local day and slot (the repeated hour in October folds in)
    SELECT "cityId", "routeId", "segmentId", local::date AS day,
           (EXTRACT(HOUR FROM local) * 4 + EXTRACT(MINUTE FROM local) / 15)::int AS slot,
           CASE WHEN EXTRACT(ISODOW FROM local) IN (6, 7) THEN 'weekend' ELSE 'weekday' END AS "dayType",
           AVG(rel) AS rel, AVG(kmh) AS kmh
    FROM buckets GROUP BY 1, 2, 3, 4, 5, 6
  )
  SELECT "cityId", "routeId", "segmentId", "dayType", slot,
         AVG(rel) AS rel, AVG(kmh) AS kmh, COUNT(*)::int AS days
  FROM daily GROUP BY 1, 2, 3, 4, 5;
  ```

  `until` is "now" for the job and "the start of the forecast day" for the backtest, so the backtest never sees the future.

- [ ] **Fallbacks** when a cell has fewer than 3 days, in this order:
  1. the same slot, both day types pooled (≥ 3 days);
  2. between 06:00 and 18:00, with a link: the segment's mean, scaled by the linked Traffic Stats route's weekday shape at that slot. Shape(slot) = mean of the route's `medianTravelTimes` ÷ its value in the Traffic Stats slot containing this quarter hour (slower travel time → lower speed). The Traffic Stats slots are uneven (30 min early, 15 min at the peaks, one 09:30–14:00 block): map each quarter hour to the slot whose range contains it, using `slotStartMinutes`/`slotEndMinutes`;
  3. the segment's mean;
  4. no history at all: no forecast for that segment. The map draws it in the stale colour.

  Record which level each cell came from, and log the counts per run: the report wants them.

- [ ] `forecast.ts`, for relative speed (colours) and km/h (popup) alike, `h` minutes ahead:

  F(target) = P(target) + (current − P(now)) · e^(−h/τ)

  `current` is the segment's `traffic_segment_state` value if it is younger than `STATE_TTL_SECONDS`; otherwise there is no deviation and F = P. Clamp to [0, the segment's highest observed value] and round to an integer.

- [ ] `run-forecast.ts`: for each city in `CITY_IDS`, read profile, links, Traffic Stats shapes and current state; compute; then in **one** transaction create the run and its rows (`createMany`, about 1,100) and delete that city's runs older than 24 hours (the cascade takes their rows).
- [ ] `main.ts`: `new Cron("2,17,32,47 * * * *", { protect: true, timezone: "UTC" }, () => runForecast(new Date()))`, just after each bucket closes. `protect` skips a run while the previous is still going. Also run once at start, so a fresh stack has a forecast without waiting. Log one line per run: segments, the fallback counts, milliseconds.

### 4 · Compose

- [ ] `predictor/Dockerfile`: [02](02-migrate.md#the-dockerfile-pattern)'s pattern, copying `shared/` and `database/` and `predictor/`, with `--filter "@greenwave/predictor..."`, `WORKDIR /app/predictor` and `CMD ["node", "--import", "tsx", "src/main.ts"]`.
- [ ] `compose.yaml`:

  ```yaml
  predictor:
    build: { context: ., dockerfile: predictor/Dockerfile }
    init: true # forwards SIGTERM to node and reaps children
    environment:
      DATABASE_URL: postgresql://greenwave:greenwave@postgres:5432/greenwave
      CITY_IDS: aarhus
    depends_on:
      migrate: { condition: service_completed_successfully }
    restart: unless-stopped
  ```

### 5 · Evaluation (week 48)

- [ ] `pnpm --filter @greenwave/predictor backtest --days 7`: for each of the last 7 days, build the profile from the history **before** that day, then for every quarter hour from 06:00 to 22:00 local time use that bucket's mean as "current" and forecast forward.
  - Horizons: +15 min, +30 min, +1 h, +2 h, +4 h, rest of day.
  - Methods: persistence (F = current), profile only (F = P), TomTom's typical speed (the target bucket's `typicalSpeedSum / sampleCount`), and ours with τ ∈ {15, 30, 60, 120} min.
  - Metrics: MAE in km/h, and the share in the right congestion level. **Weight by segment length**, not row count: neighbouring segments repeat their section's speed (17 distinct runs across 56634's 165 segments).
  - Output: `docs/report/backtest-<date>.csv` with `method,tau,horizon,maeKmh,levelAccuracy,segments,samples`.
- [ ] Pick τ from the results, set `FORECAST_TAU_MINUTES`, and record the choice in the report.

## Tests

- `slots.test.ts`: `localSlotOf` at 23:59 UTC on a winter and a summer date; `dayTypeOf` on Saturday and Sunday in Copenhagen when it is still Friday or already Monday in UTC; `slotsUntilMidnight` called at 00:05 local time gives 95 slots on a normal day, 99 on 25 Oct 2026 and 91 on 28 Mar 2027, and none when called after 23:45.
- `profile.test.ts`: the fallback order from fake cells (2 days → pooled; pooled thin → Traffic Stats shape at 10:00 but not at 19:00 → segment mean → none). Keep the SQL out of it; test the function that takes the query's rows.
- `forecast.test.ts`: h = 0 returns `current`; large h approaches P; the clamp at 0 and at the maximum; stale `current` gives P.

## Pitfalls

- **Do not average raw samples.** A pipeline bucket holds about 15 and a Vercel one 1; averaging samples would make pipeline days count fifteen times.
- **Time zones.** The old tables are UTC without a time zone (double `AT TIME ZONE` to show Danish time); the new ones are `timestamptz` (single). Day type and slot are always the **Copenhagen** ones.
- **`travelTimeRatio` in Traffic Stats is against 06:00, not free flow** (CLAUDE.md). Use `medianTravelTimes` for the shape, as above.
- **Traffic Stats segments are not live segments.** Different ids; the only bridge is the route link.
- **`load-*` cities**: the load test runs as a separate Compose project with its own volumes, but filter by `CITY_IDS` anyway.
- `confidence` is low where TomTom had little live data. Leave it out of the first version; mention it in the report.

## Done when

- [ ] A forecast run arrives every 15 minutes (M3, Fri 20 Nov), with one row per segment that has history.
- [ ] The backtest beats both baselines at some horizon, or the report explains why not; the CSV is under `docs/report/`.
- [ ] The prediction and evaluation report sections have drafts ([WP9](../work-plan/wp9-report-and-demo.md)).

## Not in this plan

- Drawing the forecasts: [05](05-frontend.md) phase C.
- Writing the history: [04](04-backend.md).
