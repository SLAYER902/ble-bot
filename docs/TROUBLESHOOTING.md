# Troubleshooting

- `Gateway startup requires ...`: fill the named `.env` variables without logging their values.
- Discord login rejected: rotate the token in the Developer Portal and update `.env`.
- `DEGRADED` security state: restore Redis, database, role hierarchy, or required permissions, then inspect the incident before returning to normal operation.
- Audit attribution missing: grant View Audit Log, wait for Discord audit-log propagation, and do not assume the newest audit entry is the actor.
- Backup cannot capture or restore a resource: verify the bot can view and manage it and that the target role is below the bot.
- Emoji unavailable: check the application-owned emoji ID and run `/developer emoji-status`.
