# WP9 · Report and demo

**Everyone · drafts as each package lands, then week 49.** · [← Work plan](../WORK-PLAN.md)

## Report sections

| Section                                          | Owner     | Draft by   |
| ------------------------------------------------ | --------- | ---------- |
| Architecture and MQTT design                     | Christian | Fri 6 Nov  |
| The pivot: from traffic lights to real-time data | Christian | Fri 13 Nov |
| [Broker draft](../report/broker.md)              | bd-nis    | Fri 13 Nov |
| Deployment and migration                         | Bjoern    | Fri 13 Nov |
| Adapter                                          | Christian | Fri 13 Nov |
| Backend                                          | Bjoern    | Fri 20 Nov |
| Frontend                                         | bd-nis    | Fri 20 Nov |
| Prediction method                                | bd-nis    | Fri 20 Nov |
| Resilience and scalability                       | Bjoern    | Fri 27 Nov |
| Evaluation                                       | bd-nis    | Mon 30 Nov |
| Discussion and conclusion                        | everyone  | Thu 3 Dec  |

- Credit Asbjørn (Aarhus Kommune), with the contact email.
- Explain the Vercel recorder as a temporary data collector still running at hand-in, and why ([WP0](wp0-recorder.md)).
- Reuse the current diagrams in `docs/architecture/`. The shared-subscriptions diagram is an explicitly future-work example, not the implemented pipeline.
- Cover all nine outcomes using the [learning-goal evidence table](../WORK-PLAN.md#learning-goals-and-evidence), especially the stack/framework distinction and deployment trade-offs. A tool list alone is not an explanation.
- Final files: report PDF of at least 20 pages excluding cover/references, source ZIP and narrated demo-video ZIP, submitted to both Brightspace and WISEflow. Include contributions, run instructions, measured results/limits and acknowledgement of AI assistance, in the group's own wording. Source: [Brightspace final-submission guide](https://brightspace.au.dk/d2l/le/content/220544/Home?itemIdentifier=D2L.LE.Content.ContentObject.ModuleCO-2950461), captured 25 Oct. The guide publishes no closing hour.

## Demo

Live on Christian's laptop on Fri 4 Dec, unless the 30 Nov meeting moves it:

1. `docker compose up`: the map shows all 13 routes at once, from the retained state.
2. `mosquitto_sub`: observe raw readings as `backend` on the observations filter and processed state/status anonymously, respecting the ACL.
3. A route changes colour live, and the slider shows the afternoon peak coming.
4. Kill the adapter: the map shows it offline. A short backend restart/recreation resumes the same session; show the known event IDs accounted for within the documented limits.
5. Show the measured baseline/failure results, explain scalability limits, and show the prediction backtest table. No multi-worker scaling claim.

Fallbacks: the backup video from Wed 2 Dec, and `ADAPTER_SOURCE=fixture` if TomTom is unreachable (Mapbox tiles still need the internet).
