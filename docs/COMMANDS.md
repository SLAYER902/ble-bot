# Command inventory

Command definitions are generated from typed metadata and validated by `pnpm commands:validate`.

| Family        | Implemented operations                             |
| ------------- | -------------------------------------------------- |
| `/help`       | Base help and command search                       |
| `/setup`      | Start, status, diagnostics                         |
| `/security`   | Status, enable, mode, latest incident              |
| `/backup`     | Create, list, inspect, non-destructive compare     |
| `/moderation` | Warn, timeout, kick, ban, unban, persisted history |
| `/ticket`     | Create, close, reopen, claim, unclaim, list        |
| `/role`       | Add, remove, info with hierarchy preflight         |
| `/utility`    | Ping, uptime, timestamp                            |
| `/developer`  | Owner-only status and emoji status                 |

Deploy test-guild commands with `pnpm commands:deploy:test`. Global deployment is always explicit through `pnpm commands:deploy:global` and is never performed at startup.
