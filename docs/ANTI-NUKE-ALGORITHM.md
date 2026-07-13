# BLE Shield algorithm

1. Normalize a Discord event with resource, timestamp, source, and action weight.
2. Fetch the relevant audit-log action only after a jittered bounded delay of 250, 600, 1,200, and 2,000 milliseconds.
3. Correlate candidates using guild, expected action, target, timestamp, and executor evidence.
4. Atomically update per-actor, per-guild, and per-event-type Redis sorted-set windows.
5. Compute a clamped score from action weight, velocity, diversity, criticality, permission escalation, novelty, coordination, account risk, trust, maintenance, and confidence.
6. Explicitly transition `NORMAL`, `ELEVATED`, `CONTAINMENT`, `LOCKDOWN`, `RECOVERY`, or `DEGRADED`.
7. Create or extend an incident, then execute only safe, idempotent containment actions.

Default alert, containment, and emergency thresholds are 40, 70, and 100. Trust reduces sensitivity but never disables monitoring. Unknown actors are not punished.
