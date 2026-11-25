# Recorded traffic history

`traffic-history.csv.gz` is a lossless copy of the proof of concept's `traffic_history` table: real TomTom readings for Aarhus's 13 routes and 1,081 segments, sampled every 15 minutes.

- **Period:** 2 Nov 2026 22:45 UTC to 23 Nov 2026 12:15 UTC
- **Rows:** 2,084,706, one per segment per quarter hour
- **`recordedAt`:** the run's UTC quarter hour
- **`segmentIdStr`:** a string, because TomTom's ids exceed JavaScript's safe integer range
- **Speeds:** km/h. `relativeSpeed` is a percentage of free flow and can exceed 100

Load it into the database the root `.env` points at. Re-running it is safe, because rows already present are skipped:

```bash
pnpm db:import-history
```

The predictor learns from these rows on its next run, or at once with `docker compose restart predictor`.

With these rows loaded into a database the stack has run against (the backend stores the segment lengths), this reproduces `docs/report/backtest-2026-11-23.csv`, the seven days 16–22 Nov:

```bash
pnpm --filter @greenwave/predictor backtest --days 7 --until 2026-11-23
```
