# Command inventory

Command definitions are generated from typed metadata and validated by `pnpm commands:validate`.

| Family        | Implemented operations                                                                    |
| ------------- | ----------------------------------------------------------------------------------------- |
| `/help`       | Interactive category navigation, modal search, and command details                        |
| `/setup`      | Interactive start, status, continue, diagnostics, and state export                        |
| `/security`   | Status, enable, mode, latest incident                                                     |
| `/backup`     | Create, list, inspect, non-destructive compare                                            |
| `/moderation` | Warn, timeout, kick, ban, unban, persisted history                                        |
| `/ticket`     | Persistent panel setup, modal intake, controls, close/reopen, claim, transcript, and list |
| `/role`       | Add, remove, info with hierarchy preflight                                                |
| `/premium`    | Free/Premium status, features, comparison, and enforced ticket-panel limits               |
| `/utility`    | Ping, uptime, timestamp                                                                   |
| `/developer`  | Owner-only status and emoji status                                                        |

Deploy test-guild commands with `pnpm commands:deploy:test`. Global deployment is always explicit through `pnpm commands:deploy:global` and is never performed at startup.
