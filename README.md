# BLE Bot

BLE Bot is a TypeScript Discord application built around BLE Shield, a defensive anti-nuke engine that correlates gateway activity with audit-log evidence before deciding whether narrow containment is safe.

It deliberately does not provide offensive server-destruction tooling. It never auto-bans the guild owner, does not punish unresolved actors, and stops automated containment when its Redis safety layer is unavailable.

## Included foundation

- Strict TypeScript modular monolith with PostgreSQL, Redis, BullMQ, Pino, Zod, Vitest, ESLint, Prettier, Docker, and generated Drizzle migrations.
- BLE Shield normalized events, jittered bounded audit correlation, Redis-backed atomic rolling windows, explainable risk scoring, state transitions, incidents, and narrow role/webhook containment.
- BLE Backup structural snapshots with checksum verification, encrypted local storage when `ENCRYPTION_KEY` is present, list/inspect support, and restore previews that make no changes.
- Resumable setup state, health and Prometheus endpoints, central custom application-emoji registry, interaction error handling, owner-only emoji diagnostics, and command deployment scripts.
- BLE AI provider and atomic credit-reservation infrastructure. AI remains disabled until an OpenAI-compatible provider is configured.

The currently registered command families are `/help`, `/setup`, `/security`, `/backup`, `/moderation`, `/ticket`, `/role`, `/utility`, and owner-only `/developer`. Other requested product modules are intentionally not registered until they have complete, safe implementations; BLE Bot never reports an unavailable feature as successful.

## Prerequisites

- Node.js 24 LTS or another Node.js version supported by `package.json`.
- pnpm 10 or newer.
- PostgreSQL 17, Redis 7, and a Discord application token.
- Docker Compose is the simplest local stack.

## Local development

```powershell
Copy-Item .env.example .env
pnpm install
pnpm db:migrate
pnpm commands:validate
pnpm commands:deploy:test
pnpm dev
```

Set at least `DISCORD_TOKEN`, `DISCORD_CLIENT_ID`, `DISCORD_TEST_GUILD_ID`, `DATABASE_URL`, and `REDIS_URL` in `.env`. Do not commit `.env`.

Run the quality suite:

```powershell
pnpm lint
pnpm format:check
pnpm typecheck
pnpm test
pnpm test:security
```

## Docker

```powershell
Copy-Item .env.example .env
docker compose up -d postgres redis lavalink
docker compose run --rm bot node dist/scripts/migrate.js
docker compose run --rm bot node dist/scripts/deploy-commands.js --scope test
docker compose up -d bot worker
docker compose logs -f bot
```

The Compose network is internal. Only the health endpoint binds to `127.0.0.1:3001`; PostgreSQL, Redis, and Lavalink are not public.

## Discord Developer Portal

Create a bot application and enable these privileged intents only when used:

- Server Members: required for member-oriented security correlation, welcome, and raid analysis.
- Message Content: only when `MESSAGE_CONTENT_ENABLED=true`; required for message AutoMod and message features.

BLE Bot requests Guilds, Guild Members, Guild Moderation, and Guild Voice States by default. Message reactions are requested only when `REACTION_FEATURES_ENABLED=true`. It does not request the Presence intent.

Invite with the `bot` and `applications.commands` scopes. Core operational permissions are View Audit Log, Manage Roles, Manage Webhooks, Manage Channels, Moderate Members, Kick Members, Ban Members, Send Messages, Embed Links, Read Message History, and Connect/Speak if voice or music modules are enabled. Put the BLE Bot role above every role it must manage; Discord does not allow it to manage users or roles above its own role, and it can never stop the server owner.

## Custom application emojis

Emoji values use the form `name:123456789012345678` or `<:name:123456789012345678>`. Set only application-owned emoji IDs in `.env`, then verify syntax with:

```powershell
pnpm emoji:validate
```

Missing or unavailable emojis use text-only labels; the bot never substitutes Unicode emoji characters. Owners can use `/developer emoji-status` after the bot is connected.

## Commands

```text
/help
/setup start | status | diagnostics
/security status | enable | mode | incident
/backup create | list | inspect | compare
/moderation warn | timeout | kick | ban | unban | history
/ticket create | close | reopen | claim | unclaim | list
/role add | remove | info
/utility ping | uptime | timestamp
/developer emoji-status | status
```

`/backup compare` is a non-destructive restore preview. It does not restore message history, webhook tokens, or resources the bot cannot manage.

## Operations

```powershell
pnpm db:migrate
pnpm commands:deploy:test
pnpm commands:deploy:global
pnpm commands:delete:test
pnpm start
pnpm worker:start
```

Health endpoints bind to `HEALTH_HOST` and `HEALTH_PORT`:

```text
GET /healthz
GET /readyz
GET /metrics
```

See [deployment instructions](docs/DEPLOYMENT.md), [security model](docs/SECURITY-MODEL.md), and [testing instructions](docs/TESTING.md).
