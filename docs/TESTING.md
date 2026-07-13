# Testing

```powershell
pnpm lint
pnpm format:check
pnpm typecheck
pnpm test
pnpm test:security
```

Unit tests cover risk scoring, correlation, transitions, duration parsing, mention sanitization, backup checksums, and backup diff planning. The security simulator is offline-only and refuses production mode.

Manual test-guild checklist: deploy test commands; run `/setup diagnostics`; create and inspect a backup; compare it; trigger only harmless test role/channel changes; confirm that audit attribution is visible; move the bot below a test role to verify hierarchy reporting; stop Redis to verify `DEGRADED` behavior. Do not run destructive tests in public servers.
