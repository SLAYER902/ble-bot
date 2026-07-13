# Gateway intents

| Capability                         | Intent                             | Status                                       |
| ---------------------------------- | ---------------------------------- | -------------------------------------------- |
| Slash commands and guild resources | Guilds                             | Required                                     |
| Member-oriented security analysis  | Guild Members                      | Required for enabled core security listeners |
| Moderation and AutoMod events      | Guild Moderation                   | Required                                     |
| Voice features                     | Guild Voice States                 | Enabled for voice architecture               |
| Message scanning                   | Guild Messages and Message Content | Optional, disabled by default                |
| Reaction features                  | Guild Message Reactions            | Optional, disabled by default                |
| Presence features                  | Guild Presences                    | Not requested                                |

Privileged intents must also be enabled in the Discord Developer Portal when required.
