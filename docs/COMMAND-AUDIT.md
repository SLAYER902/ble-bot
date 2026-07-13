# BLE Bot command audit

Audit date: 2026-07-14

The deployed bot is a defensive moderation and recovery foundation. Its existing commands remain
the compatibility baseline for this upgrade. A command is only added when its service and
interaction path are implemented; BLE Bot must not register placeholder commands.

| Command family | Status                | Current capability                                                                                                                                                       | Upgrade direction                                                                                                |
| -------------- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------- |
| `/help`        | Implemented           | Category selector, search modal, Home/Setup/Previous/Next navigation, and permission-aware command summaries                                                             | Add pagination only when a category grows beyond Discord embed limits                                            |
| `/setup`       | Implemented           | Persisted setup state, interactive Continue/Diagnostics/Progress/module navigation, and safe state export                                                                | Add module-specific configuration when those modules exist                                                       |
| `/security`    | Implemented           | Policy status, enable, mode, and most recent incident                                                                                                                    | Add richer incident navigation without weakening BLE Shield                                                      |
| `/backup`      | Partially implemented | Create, list, inspect, and non-destructive restore comparison                                                                                                            | Add action-oriented previews and pagination                                                                      |
| `/moderation`  | Implemented           | Warn, timeout, kick, ban, unban, and case history                                                                                                                        | Add interactive case navigation; `/mod` is not currently a compatible alias                                      |
| `/automod`     | Missing               | No message-processing module is registered                                                                                                                               | Requires explicit message-content configuration and a complete rule engine                                       |
| `/logs`        | Missing               | Log channel fields exist in guild settings only                                                                                                                          | Requires configuration panels and a delivery service                                                             |
| `/welcome`     | Missing               | No welcome or auto-role handler is registered                                                                                                                            | Requires member intent and a persisted configuration module                                                      |
| `/goodbye`     | Missing               | No goodbye handler is registered                                                                                                                                         | Requires member intent and a persisted configuration module                                                      |
| `/verify`      | Missing               | No verification workflow is registered                                                                                                                                   | Requires a safe role and challenge design                                                                        |
| `/role`        | Partially implemented | Safe add, remove, and information commands                                                                                                                               | Role-panel builder is not implemented                                                                            |
| `/ticket`      | Partially implemented | Direct creation plus persistent panels, modal intake, selectors, a ticket control panel, staff claims, close confirmation, timeline, transcript export, and panel limits | Add configurable ticket types, transfer, priority editor, scheduled deletion, and long-term transcript retention |
| `/music`       | Partially implemented | Lavalink v4 search and playback, persistent controller, queue actions, same-voice-channel controls, and automatic cleanup are implemented                                | Add durable guild settings, queue pagination, autoplay, and restart recovery                                     |
| `/voice`       | Missing               | No temporary voice lifecycle service is registered                                                                                                                       | Requires persisted templates, controls, and empty-channel cleanup                                                |
| `/utility`     | Implemented           | Ping, uptime, and timestamp                                                                                                                                              | No urgent change required                                                                                        |
| `/poll`        | Missing               | No poll persistence or workflow is registered                                                                                                                            | Requires a persisted interaction model                                                                           |
| `/giveaway`    | Missing               | No giveaway persistence or worker is registered                                                                                                                          | Requires a fair, auditable selection service                                                                     |
| `/reminder`    | Broken/incomplete     | Database table exists, but no command or worker handler is registered                                                                                                    | Requires command, scheduling, and delivery implementation                                                        |
| `/level`       | Missing               | No leveling service is registered                                                                                                                                        | Requires an opt-in activity model and privacy review                                                             |
| `/ai`          | Partially implemented | Provider and atomic credit infrastructure exist; no command is registered                                                                                                | Add only with explicit provider configuration and usable interaction flow                                        |
| `/privacy`     | Missing               | Privacy documentation exists, but no command is registered                                                                                                               | Requires retained-data inspection and deletion workflow                                                          |
| `/premium`     | Implemented           | Free/Premium compatibility layer, central limits, panel usage enforcement, and status/features/compare views                                                             | Add billing integration only when a real provider is approved                                                    |
| `/developer`   | Implemented           | Owner-only status and custom-emoji configuration report                                                                                                                  | Keep owner-only and extend diagnostics as new systems are added                                                  |

## Existing runtime findings

- The router now accepts slash commands, buttons, string selects, channel selects, role selects,
  and modals through typed component handlers. Ticket and setup controls revalidate the guild,
  current record, permission, and state before execution.
- Ticket persistence now includes panel, subject, details, control-message, participant, and
  timeline data through the additive `0001_zippy_zarek` migration.
- `guild_entitlements` retains its existing enum. A compatibility layer maps legacy paid tiers to
  the user-facing Premium plan and centralizes current limits.
- Music now uses Lavalink v4’s REST player API and the Discord voice-gateway update flow. It registers
  only working playback/search/controller/queue controls and disconnects automatically after an empty
  voice channel or idle queue. Voice-channel management remains unregistered until a durable temporary
  voice service is implemented.

## Implementation order

1. Central BLE UI and a durable interaction router.
2. Ticket panels, modal intake, ticket controls, timeline, transcript, and free-tier limits.
3. Setup/help/premium navigation using the same interaction foundation.
4. Music playback and lifecycle controls, then durable temporary voice-channel management.
