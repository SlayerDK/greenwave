# WP8 · Clean up the proof of concept

**Christian · part 1 Tue 17 – Fri 20 Nov; part 2 after 4 Dec.** Part 1 needs WP5's live map. · [← Work plan](../WORK-PLAN.md)

## Part 1

- [ ] Remove:
  - `src/lib/traffic/tomtom-service.ts` (now in the adapter) and `src/app/api/traffic/` with its test
  - `refresh-traffic-button.tsx`, `record-snapshot-button.tsx`, `recordRouteSnapshotsAction`, `trafficMutations`
  - `src/hooks/traffic/use-traffic.ts` (replaced by `use-live-traffic.ts`)
  - `history-service.ts`, `src/app/api/cron/traffic-history/`, and the `api/cron` exclusion in `src/proxy.ts` with its test
  - `TOMTOM_API_KEY` and `CRON_SECRET` from `src/lib/config/env.ts` and `.env.example`
- [ ] Rewrite the traffic sections of `CLAUDE.md`, including the hooks rule: the live hook writes into the query cache from MQTT.

The frozen Vercel deployment keeps its own copy of the cron route, so recording continues.

## Part 2 (after the hand-in)

- [ ] Remove `.github/workflows/traffic-history.yml`, `vercel.json`, the `build-vercel` script and the Vercel section of `README.md`.
- [ ] Disconnect the Vercel project, after a last Neon export if wanted.

**Done when** (part 1) the app makes no TomTom call.
