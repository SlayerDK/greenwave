# WP0 · Restart the history recorder

**Christian · Mon 2 Nov.** WP6 needs the data. · [← Work plan](../WORK-PLAN.md)

The hourly cron has never run on schedule: all 57 runs failed because `APP_URL` and `CRON_SECRET` were empty until 19 Oct, and then the workflow was disabled. Neon holds about one hour of history. Restart it at 15-minute resolution before anything restructures `main`.

The code is in [SlayerDK/greenwave#2](https://github.com/SlayerDK/greenwave/pull/2) and [SlayerDK/greenwave#4](https://github.com/SlayerDK/greenwave/pull/4); [#5](https://github.com/SlayerDK/greenwave/pull/5) deployed it and [#6](https://github.com/SlayerDK/greenwave/pull/6) froze Vercel, all merged on 2 Nov.

- [x] `src/lib/traffic/history-service.ts` keys rows by the UTC quarter hour instead of the hour. Update its test.
- [x] `.github/workflows/traffic-history.yml` runs at `7,22,37,52 * * * *`.
- [x] Replace "hourly" in `CLAUDE.md`, `README.md` and the `TrafficHistory` comment in `prisma/schema.prisma`.
- [x] `gh workflow enable traffic-history.yml`.
- [x] Also record one `traffic_route_history` row per route per run (travel and typical time, delay, completeness, confidence, passable) and each segment's `confidence`. Without the route rows, `slowerThanUsualSince` can't be tuned on recorded data.
- [x] Get production deploying again. Every Git-triggered build since 19 Oct had been canceled without a build log, so production still ran the hourly code from `54d8673`. Vercel seems to evaluate a plain `[ "$VERCEL_ENV" != production ]` itself and skip production; with an `echo` in front the command ran in the build, saw `VERCEL_ENV=production` and built. The run at 15:15 UTC keyed 1,081 rows under 15:15.
- [x] Freeze Vercel with `"ignoreCommand": "exit 0"` in `vercel.json`, in its own commit after the deploy. Vercel now skips every build, so production keeps this recorder while `main` is rebuilt.
- [ ] Confirm the schedule: GitHub fires runs at :07, :22, :37 and :52 on its own.

**Times are UTC.** `recordedAt` holds the start of the slot in UTC, in a `TIMESTAMP(3)` column without a time zone, so Neon shows it as is: one hour behind Danish time in winter (CET), two in summer (CEST). A row at `22:45` was recorded at 23:45 Danish time. The data is right, and UTC is deliberate: in local time the October change would repeat an hour and the March change would skip one. For Danish time, use `("recordedAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Europe/Copenhagen'`; a single `AT TIME ZONE 'Europe/Copenhagen'` reads the UTC value as Danish time and shifts it the wrong way.

**Done when** a scheduled run inserts rows under its quarter hour, with route rows beside them, and the next push shows as a skipped build on Vercel.
