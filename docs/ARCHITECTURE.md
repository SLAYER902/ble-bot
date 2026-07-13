# Architecture

BLE Bot is a modular monolith. Discord commands and events are transport edges; services own business rules, repositories own durable state, Redis provides short-lived coordination, and BullMQ owns deferred work.

```text
Discord gateway -> normalized event -> audit resolver -> risk engine -> policy -> incident -> containment or observation
Slash command -> authorization -> service -> repository or queue -> UI response
```

The gateway process owns Discord interactions, the worker process owns background queues, PostgreSQL owns durable records, Redis owns rolling windows and queue coordination, and Lavalink is isolated from BLE Shield. The health service exposes only liveness, readiness, and metrics.

The current schema includes guild setup, features, security policy/events/incidents, maintenance, idempotency, backups, moderation cases, tickets, reminders, AI balances/reservations, and entitlements. Snowflakes are stored as strings.
