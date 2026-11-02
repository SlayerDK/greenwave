# WP9 · Report and demo

**Everyone · drafts as each package lands, then week 49.** · [← Work plan](../WORK-PLAN.md)

## Report sections

| Section                                          | Owner     | Draft by   |
| ------------------------------------------------ | --------- | ---------- |
| Architecture and MQTT design                     | Christian | Fri 6 Nov  |
| The pivot: from traffic lights to real-time data | Christian | Fri 13 Nov |
| Broker, deployment and adapter                   | Bjoern    | Fri 13 Nov |
| Backend                                          | Christian | Fri 20 Nov |
| Frontend                                         | bd-nis    | Fri 20 Nov |
| Prediction method                                | bd-nis    | Fri 20 Nov |
| Scalability and load test                        | Bjoern    | Fri 27 Nov |
| Evaluation                                       | bd-nis    | Mon 30 Nov |
| Discussion and conclusion                        | everyone  | Thu 3 Dec  |

- Credit Asbjørn (Aarhus Kommune), with the contact email.
- Explain the Vercel recorder as a temporary data collector still running at hand-in, and why ([WP0](wp0-recorder.md)).
- Reuse the diagrams in `docs/architecture/`.

## Demo

Live on Christian's laptop on Fri 4 Dec, unless the 30 Nov meeting moves it:

1. `docker compose up`: the map shows all 13 routes at once, from the retained state.
2. `mosquitto_sub`: observations come in, state goes out.
3. A route changes colour live, and the slider shows the afternoon peak coming.
4. Kill the adapter: the map shows it offline. Restart the backend: nothing is lost.
5. The load-test charts and the backtest table.

Fallbacks: the backup video from Wed 2 Dec, and `ADAPTER_SOURCE=fixture` if TomTom is unreachable (Mapbox tiles still need the internet).
