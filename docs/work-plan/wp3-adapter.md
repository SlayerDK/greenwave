# WP3 · Adapter

**Christian · Mon 9 – Wed 11 Nov.** Needs WP1's contracts and WP2's broker. · [← Work plan](../WORK-PLAN.md)

> **Specification:** the [Aarhus adapter design](../designs/adapter.md), which replaced [plan 03](../implementation-plans/03-adapter.md)'s steps after review. This file keeps the owner, dates and summary.

`@greenwave/adapter`, the Compose service `adapter-aarhus`, reads Aarhus's 13 TomTom routes at second 0 of every minute. It turns each answer into an observation (string segment ids, `[longitude, latitude]` pairs, `CW_AU_` trimmed, `observedAt` from TomTom's `date` header), checks it against `observationSchema`, and publishes it at QoS 1. A route that fails is logged and publishes nothing, and polling pauses while the broker is unreachable. A retained `online`/`offline` status with a Last Will reports whether the process is alive. `ADAPTER_SOURCE=fixture` replays 13 recorded responses with ±10% speed noise, labelled `source: "fixture"`, so development needs no key. The report draft is [`docs/report/adapter.md`](../report/adapter.md).

**Done when** `mosquitto_sub` shows 13 observations a minute, killing the container turns the status `offline`, and the adapter section has a draft. Check it with the two subscribers in the design's [Running it](../designs/adapter.md#running-it): observations as `backend`, the status anonymously.
