# Broker report draft

Owner: bd-nis. Implementation and verification dated 10 November 2026. This is a section draft for the group's report, not evidence that the whole pipeline is implemented.

## Responsibility and protocol

One Eclipse Mosquitto 2.1.2 broker routes MQTT messages between the planned Aarhus adapter, one backend and browser viewers. The adapter publishes raw observations. The backend reads them and publishes processed state. Browsers read state and adapter status over MQTT on WebSocket. The broker does not validate the application payload, classify congestion or write the application database.

Observations use QoS 1. The backend's fixed `backend-1` identity and existing normal subscription allow the broker to queue readings while that consumer is briefly offline. Delivery can repeat; the backend must deduplicate by event ID. Retained state gives new viewers the latest route state. MQTT 5 message expiry removes stale retained values. The adapter will use a retained Last Will for liveness once its service is implemented.

## Local security and operation

The broker has TCP port 1883 and WebSocket port 9001, both published only on host loopback. Compose services connect internally by service name. Anonymous clients can read processed state, adapter status and broker uptime, but not observations and cannot publish. The adapter account can write only Aarhus observations and its status. The backend account can read observations and write state, but cannot impersonate the adapter.

A one-shot init container hashes two separately generated passwords supplied from `.env`. It installs both accounts together through an atomic rename into a dedicated volume, with owner `mosquitto` and permissions `0600`. Missing or empty secrets fail before replacing the file. Plaintext passwords are not committed. The broker uses a separate persistent data volume, leaving Postgres unchanged. Password rotation requires rerunning init, restarting the broker and recreating affected clients with the updated environment.

This setup is intentionally local, without TLS, cloud infrastructure, multiple workers or a broker cluster. Anonymous browser traffic is public to local clients, independent of application login. Loopback publication is not a security boundary against other containers on the Compose network.

## Evidence

Reproduce with `pnpm broker:verify`. It uses the actual broker configuration and pinned image in an isolated Compose project alongside a fresh Postgres service, with no host Postgres port and ephemeral loopback broker ports. Test passwords and volumes are disposable. The final run passed all 28 broker checks and confirmed removal of every test-owned container, volume and network. Host tools were Node 24.22.1, pnpm 12.6.0, Docker 29.5.3 and Compose 5.1.4.

| Check group                 | Observed result                                                                                                                                                           |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Startup                     | Fresh Postgres and Mosquitto healthy; init exited 0 with only two generated MQTT secrets                                                                                  |
| Access control              | Both roles authenticate; anonymous state/status reads succeed; forbidden reads time out without a payload; all 11 tested role/topic write denials return PUBACK 135       |
| Credentials                 | Wrong passwords and unknown users refused, not downgraded to anonymous; exactly two stored users, owner `mosquitto`, mode `0600`                                          |
| WebSocket                   | Retained state/status readable; observations private; anonymous write rejected with PUBACK 135; wrong password refused                                                    |
| Expiry                      | Retained state readable immediately and absent after the two-second test expiry                                                                                           |
| Graceful restart            | Retained state and a queued, non-retained QoS 1 reading recovered by the same offline persistent session                                                                  |
| Init reruns and failures    | Two reruns preserve both logins after broker restart; either missing or empty secret exits 1 without changing the password-file checksum; no temporary directories remain |
| Host boundary and isolation | Configured host ports 1883/9001 and actual ephemeral test mappings bind only to `127.0.0.1`; test Postgres has no published host port; all test resources removed         |

The pinned `mosquitto_pub` returns process exit 0 even when the broker denies a QoS 1 publication. The verifier therefore asserts PUBACK reason 135 directly, not a shell failure. These are real broker probes, not a runtime test of the planned application services. Repository-check results are recorded separately in the PR.

## Limits and integration still to verify

Broker persistence is saved on graceful shutdown and every 60 seconds. Graceful restart does not prove power-loss durability. A crash can lose unsaved changes. Offline buffering requires an already-established subscription, the same client identity, reconnect within the 3,600-second expiry, and space in the default 1,000-message queue. At the planned 13 readings per minute, one hour is about 780 readings, an estimate rather than a capacity benchmark.

Backend deduplication, ordering, the database-commit-to-state-publication gap, adapter Last Will, backend container recreation, stale-map behaviour and the complete adapter-to-browser flow require the teammates' services and remain unverified here. The single broker is a single point of failure. Further scaling would need measured message/byte rates and processing cost before changing the design.

Implementation: [`broker/`](../../broker/README.md), [`compose.yaml`](../../compose.yaml). Contract and remaining acceptance: [broker plan](../implementation-plans/01-broker.md), [backend plan](../implementation-plans/04-backend.md), [resilience plan](../implementation-plans/07-loadgen.md).
