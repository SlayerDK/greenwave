# GreenWave work plan

How we build [`ARCHITECTURE.md`](../ARCHITECTURE.md) by the hand-in on **Fri 4 Dec 2026**. The architecture says what and why; this plan says who and when. Each work package has its own file in [`work-plan/`](work-plan/) with the steps, code and "done when".

> Written 2 Nov 2026. Tick your own checkboxes in your own PRs; Monday's planning starts from them.

- **Hand-in:** the report and a live demo, both Fri 4 Dec, with a backup video.
- **Team:** Christian, Bjoern and bd-nis, each owning a vertical slice. Slices meet only at `packages/contracts` and the database tables.
- **History:** recorded from 2 Nov by the proof of concept's Vercel cron, in 15-minute slots, then by the backend once the pipeline runs.

## Work packages

| Package                                                               | Owner     | When                                              | Needs           |
| --------------------------------------------------------------------- | --------- | ------------------------------------------------- | --------------- |
| [WP0 · Restart the history recorder](work-plan/wp0-recorder.md)       | Christian | Mon 2 Nov                                         | —               |
| [WP1 · Workspace, contracts and database](work-plan/wp1-workspace.md) | Christian | 2–6 Nov                                           | —               |
| [WP2 · Compose and the broker](work-plan/wp2-compose-and-broker.md)   | Bjoern    | 2–6 Nov, wiring 12–13 Nov                         | —               |
| [WP3 · Adapter](work-plan/wp3-adapter.md)                             | Bjoern    | 9–11 Nov                                          | WP1, WP2        |
| [WP4 · Backend](work-plan/wp4-backend.md)                             | Christian | 9–13 Nov, row lock 17–18 Nov                      | WP1, WP2        |
| [WP5 · Live map](work-plan/wp5-live-map.md)                           | bd-nis    | 5–13 Nov, slider 23–26 Nov                        | WP1; slider WP6 |
| [WP6 · Prediction](work-plan/wp6-prediction.md)                       | bd-nis    | data 2–4 Nov, job 16–20 Nov, evaluation 23–27 Nov | WP0, WP1        |
| [WP7 · Load and resilience tests](work-plan/wp7-load-tests.md)        | Bjoern    | 16–27 Nov                                         | WP3, WP4        |
| [WP8 · Clean up the proof of concept](work-plan/wp8-clean-up.md)      | Christian | 17–20 Nov, part 2 after 4 Dec                     | WP5             |
| [WP9 · Report and demo](work-plan/wp9-report-and-demo.md)             | everyone  | drafts as packages land, then week 49             | all             |

Versions, topics, MQTT users, ports and environment variables: [Libraries and connections](work-plan/libraries-and-connections.md).

Every package ends with a 1–2 page draft of its report section.

## Team

| Person        | Owns               | Also                                                                  |
| ------------- | ------------------ | --------------------------------------------------------------------- |
| **Christian** | WP0, WP1, WP4, WP8 | Keeps `CLAUDE.md` and `ARCHITECTURE.md` current; runs the demo laptop |
| **Bjoern**    | WP2, WP3, WP7      | Demo script and backup video                                          |
| **bd-nis**    | WP5, WP6           | Weekly Neon export                                                    |

## Schedule

| Week                            | Christian                                    | Bjoern                            | bd-nis                                    |
| ------------------------------- | -------------------------------------------- | --------------------------------- | ----------------------------------------- |
| **45** · 2–6 Nov · Skeleton     | WP0; contracts by Tue; workspace, db, schema | Mosquitto, ACL, images, `migrate` | Traffic Stats curves, backfill; live hook |
| **46** · 9–13 Nov · Pipeline    | Backend                                      | Adapter; Compose wiring           | Map from Postgres, live updates, badges   |
| **47** · 16–20 Nov · Predict    | Integration fixes, clean-up 1, row lock      | Load generator, resilience tests  | Predictor                                 |
| **48** · 23–27 Nov · Evaluate   | Tune route rules, check `--scale backend=3`  | Load scenarios, charts            | Forecast slider, backtest                 |
| **49** · 30 Nov–4 Dec · Hand-in | Final docs, demo laptop                      | Demo script, backup video         | Final export and evaluation numbers       |

Milestones:

- **M1 · Fri 6 Nov.** `docker compose up` starts postgres, mosquitto and migrate healthy; all checks pass; contracts and schema merged.
- **M2 · Mon 16 Nov · integration day.** Real TomTom readings reach the browser map every minute without a reload.
- **M3 · Fri 20 Nov.** Forecasts every 15 minutes, the load generator runs, clean-up part 1 merged.
- **M4 · Fri 27 Nov · feature freeze.** Everything but clean-up part 2 is done, and every report section has a draft.

Week 49:

| Day        | What                                                                |
| ---------- | ------------------------------------------------------------------- |
| Mon 30 Nov | Planning; confirm the demo laptop. bd-nis: final export and numbers |
| Tue 1 Dec  | Demo rehearsal                                                      |
| Wed 2 Dec  | Rehearsal fixes. Bjoern records the backup video                    |
| Thu 3 Dec  | Report finished. Christian backfills the demo laptop in the evening |
| Fri 4 Dec  | Hand-in and live demo                                               |

Meetings: 30-minute planning on Mondays, 15-minute check-in on Thursdays.

## Decisions

| Topic            | Decision                                                                                                      |
| ---------------- | ------------------------------------------------------------------------------------------------------------- |
| History          | 15-minute buckets, about 100,000 rows a day. Every Traffic Stats slot lines up with a quarter hour            |
| Recording        | The Vercel cron, frozen from 2 Nov until after the hand-in. The new pipeline records nothing before 16 Nov    |
| Prediction       | A typical-speed profile plus today's fading deviation, in TypeScript. Explainable, with two baselines to beat |
| Forecasts on map | A slider over every 15-minute slot until midnight, local time                                                 |
| Route status     | Two flags: `congestedSince` (matches the colours) and `slowerThanUsualSince` (worse than a normal day)        |
| TomTom polling   | Every minute. Development uses recorded fixtures                                                              |
| Checks           | No CI: the Husky hooks, plus the reviewer runs the checks                                                     |

## Risks

| Risk                                        | What we do                                                       |
| ------------------------------------------- | ---------------------------------------------------------------- |
| Too little history                          | Record from 2 Nov, backfill weekly, fall back to Traffic Stats   |
| Neon fills up (~400 MB by 4 Dec of 1 GB)    | Weekly export; prune exported rows past 80%                      |
| GitHub delays or drops scheduled runs       | Accept the gaps; a profile cell needs only 3 days                |
| The workspace move breaks tooling or Vercel | One PR, after the Vercel freeze                                  |
| Integration slips                           | Contracts merged by 3 Nov; fixed integration day on 16 Nov       |
| No buffer before the hand-in                | Rolling drafts, feature freeze 27 Nov, report finished Thu 3 Dec |
| The live demo fails                         | Fixture mode and the backup video                                |
| Someone is ill or blocked                   | Every package has a reviewer who knows it                        |

## Ways of working

- One branch per package (`wp4-backend`), merged by PR. Small PRs beat big ones.
- Every PR gets one reviewer, who runs `pnpm lint && pnpm typecheck && pnpm test --run && pnpm analyze`. Changes to `packages/contracts` or the Prisma schema need both of the others.
- Unit tests sit next to the code in every package. Tests of removed code go with it ([WP8](work-plan/wp8-clean-up.md)). The [WP7](work-plan/wp7-load-tests.md) resilience checks run at M2 and before the rehearsal.
- Prerequisites: Docker Desktop; Node 24 LTS, whose corepack provides the pinned pnpm 12.6 (on newer Node, install pnpm directly); your own Mapbox token. The TomTom key only where the live adapter runs or fixtures are recorded.
