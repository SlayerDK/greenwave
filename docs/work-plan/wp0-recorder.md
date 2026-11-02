# WP0 · Restart the history recorder

**Christian · Mon 2 Nov.** WP6 needs the data. · [← Work plan](../WORK-PLAN.md)

The hourly cron has never run on schedule: all 57 runs failed because `APP_URL` and `CRON_SECRET` were empty until 19 Oct, and then the workflow was disabled. Neon holds about one hour of history. Restart it at 15-minute resolution before anything restructures `main`.

The code change is in [SlayerDK/greenwave#2](https://github.com/SlayerDK/greenwave/pull/2).

- [ ] `src/lib/traffic/history-service.ts` keys rows by the UTC quarter hour instead of the hour. Update its test.
- [ ] `.github/workflows/traffic-history.yml` runs at `7,22,37,52 * * * *`.
- [ ] Replace "hourly" in `CLAUDE.md`, `README.md` and the `TrafficHistory` comment in `prisma/schema.prisma`.
- [ ] Merge to `main`, so Vercel deploys production. Then:

  ```bash
  gh workflow enable traffic-history.yml
  gh workflow run traffic-history.yml   # expect about 1,079 rows inserted
  ```

- [ ] In a separate commit, freeze Vercel with `"ignoreCommand": "exit 0"` in `vercel.json`. Vercel then skips every later build, so production keeps this recorder while `main` is rebuilt. It can't go in the same commit, or that deploy is skipped too.

**Done when** a scheduled run inserts rows, and the next push shows as a skipped build on Vercel.
