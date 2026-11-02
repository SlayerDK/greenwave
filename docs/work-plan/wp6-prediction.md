# WP6 · Prediction

**bd-nis · data Mon 2 – Wed 4 Nov, job Mon 16 – Fri 20 Nov, evaluation Mon 23 – Fri 27 Nov.** Needs WP0's data and WP1's schema. · [← Work plan](../WORK-PLAN.md)

## Data (week 45, then every Monday)

- [ ] Import Neon's history locally. Christian shares the Neon URL; the local copies of both history tables are staging copies, so empty them first:

  ```bash
  psql "$LOCAL_URL" -c 'TRUNCATE traffic_history, traffic_route_history'
  pg_dump --data-only --table=traffic_history --table=traffic_route_history "$NEON_URL" | psql "$LOCAL_URL"
  psql "$LOCAL_URL" -f scripts/backfill-history.sql
  ```

  `scripts/backfill-history.sql` (_new_) copies the segment rows into `traffic_segment_history` with `"sampleCount" = 1` and `ON CONFLICT DO NOTHING`. `traffic_route_history` is read as it is, for tuning `slowerThanUsualSince`. Once Neon passes 80% of its quota, delete exported rows older than 7 days there.

- [ ] Fill `TrafficStatsRouteLink`: a script matches the 13 live route names to the 20 Traffic Stats `routeName`s; check by hand.
- [ ] Look at the data: each route's Traffic Stats weekday curve, and our own per weekday as it builds up.

What the recorded rows mean:

- **`recordedAt` is UTC in a column without a time zone.** `"recordedAt" AT TIME ZONE 'Europe/Copenhagen'` reads it as Copenhagen time and is off by an hour (two in summer). Use `("recordedAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Europe/Copenhagen'`.
- **`currentSpeed` and `relativeSpeed` come per traffic section, not per segment.** Neighbouring segments repeat the same values (17 distinct runs across route 56634's 165 segments), so weight errors by segment length, not by row count.
- **`typicalSpeed` is TomTom's own typical speed for the time of day**, which makes it a free third baseline.
- **`confidence`** (from 2 Nov) is low where TomTom had little live data, and those speeds are mostly estimates. Older rows have none.
- [ ] Add `TrafficForecastRun` and `TrafficSegmentForecast` in a PR on top of WP1's schema.

## The job (week 47)

`services/predictor` (_new_), every 15 minutes just after a bucket closes: `new Cron("2,17,32,47 * * * *", () => runForecast(new Date()))`.

- [ ] **Profile** P(segment, day type, slot). Day type: weekday or weekend. Slot: local 15 minutes in Europe/Copenhagen (the double `AT TIME ZONE` above in SQL, `Intl.DateTimeFormat` in TS). Average the daily bucket means, not raw samples: a pipeline bucket holds about 15 samples and a Vercel one 1, and each day should count once.
- [ ] **Fallbacks** when a cell has fewer than 3 days:
  1. the same slot, both day types pooled
  2. 06:00–18:00: the segment's mean, scaled by its linked Traffic Stats route's weekday shape
  3. the segment's mean
- [ ] **Forecast** every remaining slot today, h minutes ahead:

  F(target) = P(target) + (current − P(now)) · e^(−h/τ)

  For relative speed (colours) and km/h (popup), clamped between 0 and the highest observed speed.

- [ ] One transaction per run; delete runs older than 24 hours.
- [ ] Tests: the formula, slot and day-type helpers across a DST change, the fallback order.

## Evaluation (week 48)

- [ ] `pnpm --filter @greenwave/predictor backtest --days 7`: forecast each bucket of the last 7 days from the history before that day.
  - Metrics: MAE in km/h, and share of segments in the right congestion level.
  - Horizons: +15 min, +30 min, +1 h, +2 h, +4 h, rest of day.
  - Methods: persistence (F = current), profile only (F = P), TomTom's `typicalSpeed`, and ours with τ ∈ {15, 30, 60, 120} min. Pick τ from the results.
  - CSV output under `docs/report/`.

**Done when** forecasts arrive every 15 minutes, the backtest beats the baselines at some horizon (or the report explains why not), and the prediction and evaluation sections have drafts.
