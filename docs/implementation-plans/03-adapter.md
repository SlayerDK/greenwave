# 03 · Adapter: `adapter-aarhus`

**Compose service `adapter-aarhus`, package `@greenwave/adapter` in `adapter/`.** [WP3](../work-plan/wp3-adapter.md) · Christian · 9–11 Nov · Needs [00](00-foundation.md), [01](01-broker.md), [02](02-migrate.md) · Unblocks [04](04-backend.md) end to end, [07](07-loadgen.md). · [← Plans](README.md)

## Goal

Poll TomTom's Route Monitoring API for each of Aarhus's 13 routes at the start of every minute, turn each answer into an observation message, and publish it at QoS 1. Announce the adapter's own liveness on a retained status topic, with a Last Will that marks it `offline` if it dies. In development, replay recorded responses instead of calling TomTom.

The adapter absorbs every TomTom quirk (string segment ids, `{latitude, longitude}` points, the `CW_AU_` prefix, the `date` header), so nothing downstream knows TomTom exists.

## Specification

The adapter's specification is the [Aarhus adapter design](../designs/adapter.md), which replaced this plan's steps after review.
