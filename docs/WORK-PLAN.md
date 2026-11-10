# GreenWave work plan

How we build [`ARCHITECTURE.md`](../ARCHITECTURE.md) by the hand-in on **Fri 4 Dec 2026**. The architecture says what and why; this plan says who and when. Each work package has its own file in [`work-plan/`](work-plan/) with the steps, code and "done when".

> Written 2 Nov 2026. Tick your own checkboxes in your own PRs; Monday's planning starts from them.

- **Hand-in:** report PDF, source ZIP and narrated demo-video ZIP to both Brightspace and WISEflow, Fri 4 Dec. The planned live demo is a team activity, not a substitute for those files. [Final guide](https://brightspace.au.dk/d2l/le/content/220544/Home?itemIdentifier=D2L.LE.Content.ContentObject.ModuleCO-2950461).
- **Team:** Christian, Bjoern and bd-nis, each owning a vertical slice. Slices meet only at `shared/` (the contracts) and the database tables.
- **History:** recorded from 2 Nov by the proof of concept's Vercel cron, in 15-minute slots, then by the backend once the pipeline runs.

## Ambition

Målet er niveauet for karakteren 7 (C). Det er et indsatsniveau, ikke en
karakter kurset giver. Byg og
foreslå ikke mere, end appropriate kræver. Ved tvivl: skær væk og
sig det, i stedet for at tilføje.

## Learning goals and evidence

This is a planning assessment, not a statement that the unfinished system has passed. The nine formal outcomes already exist in the parent SWIoT repo at `course/reference/course-catalogue.md`, mirrored in `data/course.json`. Their authority is the [AU course catalogue](https://kursuskatalog.au.dk/da/course/141990/SWIOT-01-Internet-of-Things-Software-Perspective), not a numerical grade target: assessment is pass/fail against the submitted work as a whole.

| Outcome                                            | What the planned project can demonstrate                                                                                                  | Evidence still required                                                                                                                                                                                 |
| -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. IoT concepts, challenges and opportunities      | Real traffic information used for a live application; freshness, connectivity, privacy and scaling limits                                 | Explain the real-world system and the third-party data boundary. Do not claim that we built or verified the underlying road sensors.                                                                    |
| 2. Main software components                        | Adapter, broker, processing backend, database, web application and prediction job                                                         | A component diagram and a trace through one real observation.                                                                                                                                           |
| 3. Apply and explain IoT architecture              | Event-driven pipeline, contracts, single writer and explicit local deployment                                                             | Justify boundaries and local/self-managed placement; discuss at least two relevant Lab 7 concerns and alternatives.                                                                                     |
| 4. Apply and explain development techniques        | Schema validation, fixtures, pure rules, tests, transactions, deduplication and event-time ordering                                       | Run the relevant tests, show an important implementation example, and explain the result in our own words.                                                                                              |
| 5. Protocol stack versus framework                 | MQTT/HTTP/WebSocket transport versus the application tools built on those protocols                                                       | Explicitly distinguish the protocol stack from MQTT.js, Next.js/React, Prisma and the runtime; a broker or a library alone is not an entire IoT platform.                                               |
| 6. Explain construction of a protocol stack        | MQTT over TCP/IP between services; browser MQTT over WebSocket over TCP/IP; HTTPS into the adapter                                        | Draw the actual stack for each hop, including the host network and where TLS is or is not present. We do not implement a new TCP/IP stack.                                                              |
| 7. Explain use of frameworks across technologies   | A custom IoT application combining Node.js/MQTT.js, Next.js/React and Prisma/Postgres                                                     | Show how the frameworks/libraries are configured and connected, their roles and limits, and compare the self-managed approach with a managed IoT platform. No second platform deployment is prescribed. |
| 8. Collect, format, persist and visualize IoT data | TomTom acquisition, normalized observation/state schemas, current/history tables and live map; the existing prediction plan adds analysis | Trace a real reading through all stages, verify stored values and timestamps, and distinguish fixture, historical and live results.                                                                     |
| 9. Design and implement IoT software/applications  | Runnable end-to-end application with a useful traffic view                                                                                | A clean run, real-data end-to-end evidence, focused failure/recovery checks and the narrated demo. A written design alone does not satisfy implementation.                                              |

[Brightspace Lab 2](https://brightspace.au.dk/d2l/le/content/220544/Home?itemIdentifier=D2L.LE.Content.ContentObject.ModuleCO-2870692) requires justified architecture, data handling, failure/scalability consideration and relevant security concerns. [L6](https://brightspace.au.dk/d2l/le/content/220544/Home?itemIdentifier=D2L.LE.Content.ContentObject.ModuleCO-2843971) requires MQTT. [L2](https://brightspace.au.dk/d2l/le/content/220544/Home?itemIdentifier=D2L.LE.Content.ContentObject.ModuleCO-2843966) includes custom IoT systems built with web frameworks; using a managed IoT product is not the only framework approach. [Lab 8](https://brightspace.au.dk/d2l/le/content/220544/Home?itemIdentifier=D2L.LE.Content.ContentObject.ModuleCO-2960348) labels multiple processing instances and load/backpressure as optional advanced exercises.

Decision on 9 Nov: retain the 7/C effort target, meet every learning outcome with explanation and evidence, and do not add features to imitate a higher numerical grade. The planned history, classification, live state and prediction/backtest already provide substantial depth. This judgement does not predict the lecturer's assessment.

## Required pipeline scope

One Aarhus adapter, one Mosquitto broker and one backend with a normal subscription and fixed `backend-1` identity. Keep transactions, deduplication, ordering, retained state/expiry, Last Will and focused resilience evidence. Keep the existing frontend and prediction scope. Remove shared subscriptions, three-worker scaling, required synthetic-city load generation, extra monitoring users and custom queue tuning from the delivery path. Explain 100× growth and its limits instead of claiming a measured horizontal-scaling result.

## Work packages

| Package                                                                  | Owner                             | When                                              | Needs           |
| ------------------------------------------------------------------------ | --------------------------------- | ------------------------------------------------- | --------------- |
| [WP0 · Restart the history recorder](work-plan/wp0-recorder.md)          | Christian                         | Mon 2 Nov                                         | —               |
| [WP1 · Workspace, contracts and database](work-plan/wp1-workspace.md)    | Christian                         | 2–6 Nov                                           | —               |
| [WP2 · Compose and the broker](work-plan/wp2-compose-and-broker.md)      | bd-nis (broker), Bjoern (migrate) | 2–6 Nov, wiring 12–13 Nov                         | —               |
| [WP3 · Adapter](work-plan/wp3-adapter.md)                                | Christian                         | 9–11 Nov                                          | WP1, WP2        |
| [WP4 · Backend](work-plan/wp4-backend.md)                                | Bjoern                            | 9–13 Nov                                          | WP1, WP2        |
| [WP5 · Live map](work-plan/wp5-live-map.md)                              | bd-nis                            | 5–13 Nov, slider 23–26 Nov                        | WP1; slider WP6 |
| [WP6 · Prediction](work-plan/wp6-prediction.md)                          | bd-nis                            | data 2–4 Nov, job 16–20 Nov, evaluation 23–27 Nov | WP0, WP1        |
| [WP7 · Resilience and scalability evidence](work-plan/wp7-load-tests.md) | Bjoern                            | 16–27 Nov                                         | WP3, WP4        |
| [WP8 · Clean up the proof of concept](work-plan/wp8-clean-up.md)         | Christian                         | 17–20 Nov, part 2 after 4 Dec                     | WP5             |
| [WP9 · Report and demo](work-plan/wp9-report-and-demo.md)                | everyone                          | drafts as packages land, then week 49             | all             |

Versions, topics, MQTT users, ports and environment variables: [Libraries and connections](work-plan/libraries-and-connections.md).

To hand a package to a teammate or their agent, use its [implementation plan](implementation-plans/README.md): one per container, with the files, code, tests and checks.

Ownership updated 9 Nov: bd-nis owns the broker, Christian the adapter, and Bjoern the backend. WP2's migration container and shared Dockerfile pattern remain with Bjoern; each service owner adds their own Compose block. The dates below remain the original targets, not a new schedule.

Every package ends with a 1–2 page draft of its report section.

## Team

| Person        | Owns                  | Also                                                                  |
| ------------- | --------------------- | --------------------------------------------------------------------- |
| **Christian** | WP0, WP1, WP3, WP8    | Keeps `CLAUDE.md` and `ARCHITECTURE.md` current; runs the demo laptop |
| **Bjoern**    | WP2 migrate, WP4, WP7 | Demo script and backup video                                          |
| **bd-nis**    | WP2 broker, WP5, WP6  | Weekly Neon export                                                    |

## Schedule

| Week                            | Christian                                    | Bjoern                                                | bd-nis                                                    |
| ------------------------------- | -------------------------------------------- | ----------------------------------------------------- | --------------------------------------------------------- |
| **45** · 2–6 Nov · Skeleton     | WP0; contracts by Tue; workspace, db, schema | Images, `migrate`                                     | Mosquitto, ACL; Traffic Stats curves, backfill; live hook |
| **46** · 9–13 Nov · Pipeline    | Adapter; its Compose wiring                  | Backend; its Compose wiring                           | Broker wiring; map from Postgres, live updates, badges    |
| **47** · 16–20 Nov · Predict    | Integration fixes, clean-up 1                | Restart/recreation checks; resilience evidence        | Predictor                                                 |
| **48** · 23–27 Nov · Evaluate   | Integration fixes                            | Tune route rules; baseline and scalability discussion | Forecast slider, backtest                                 |
| **49** · 30 Nov–4 Dec · Hand-in | Final docs, demo laptop                      | Demo script, backup video                             | Final export and evaluation numbers                       |

Milestones:

- **M1 · Fri 6 Nov.** `docker compose up` starts postgres and mosquitto healthy, with init and migrate exiting 0; all checks pass; contracts and schema merged.
- **M2 · Mon 16 Nov · integration day.** Real TomTom readings reach the browser map every minute without a reload.
- **M3 · Fri 20 Nov.** Forecasts every 15 minutes, focused failure checks recorded, clean-up part 1 merged.
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
| Pipeline scale   | One backend, fixed MQTT identity and normal subscription; multiple workers are future work                    |
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
- Every PR gets one reviewer, who runs `pnpm lint && pnpm typecheck && pnpm test --run && pnpm analyze`. Changes to `shared/` or the Prisma schema need both of the others.
- Unit tests sit next to the code in every package. Tests of removed code go with it ([WP8](work-plan/wp8-clean-up.md)). The [WP7](work-plan/wp7-load-tests.md) resilience checks run at M2 and before the rehearsal.
- Prerequisites: Docker Desktop; Node 24 LTS, whose corepack provides the pinned pnpm 12.6 (on newer Node, install pnpm directly); your own Mapbox token. The TomTom key only where the live adapter runs or fixtures are recorded.
