# WP0 · Restart the history recorder

**Christian · Mon 2 Nov.** WP6 needs the data. · [← Work plan](../WORK-PLAN.md)

The hourly cron has never run on schedule: all 57 runs failed because `APP_URL` and `CRON_SECRET` were empty until 19 Oct, and then the workflow was disabled. Neon holds about one hour of history. Restart it at 15-minute resolution before anything restructures `main`.

The code is in [SlayerDK/greenwave#2](https://github.com/SlayerDK/greenwave/pull/2) (merged) and [SlayerDK/greenwave#4](https://github.com/SlayerDK/greenwave/pull/4).

- [x] `src/lib/traffic/history-service.ts` keys rows by the UTC quarter hour instead of the hour. Update its test.
- [x] `.github/workflows/traffic-history.yml` runs at `7,22,37,52 * * * *`.
- [x] Replace "hourly" in `CLAUDE.md`, `README.md` and the `TrafficHistory` comment in `prisma/schema.prisma`.
- [x] `gh workflow enable traffic-history.yml`.
- [ ] Also record one `traffic_route_history` row per route per run (travel and typical time, delay, completeness, confidence, passable) and each segment's `confidence`. Without the route rows, `slowerThanUsualSince` can't be tuned on recorded data.
- [ ] Get production deploying again. Vercel has skipped every push to `main` since 24 Oct ("Canceled by Ignored Build Step"), so production still runs the hourly code from `54d8673`. Check the production branch in the Vercel project's Git settings, then deploy `main` once. That deploy also migrates Neon. Check with:

  ```bash
  gh workflow run traffic-history.yml   # expect a recordedAt on the quarter hour, about 1,080 rows inserted
  ```

- [ ] In a separate commit, freeze Vercel with `"ignoreCommand": "exit 0"` in `vercel.json`. Vercel then skips every later build, so production keeps this recorder while `main` is rebuilt. It can't go in the same commit, or that deploy is skipped too.

**Done when** a scheduled run inserts rows under its quarter hour, with route rows beside them, and the next push shows as a skipped build on Vercel.
