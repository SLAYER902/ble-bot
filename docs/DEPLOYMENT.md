# Deployment

1. Copy `.env.example` to `.env` and configure secrets outside source control.
2. Set a 32-byte base64 `ENCRYPTION_KEY`, `SIGNING_SECRET`, database URL, Redis URL, Discord credentials, and a non-default PostgreSQL password.
3. Build with `pnpm install --frozen-lockfile` and `pnpm build`.
4. Apply migrations with `pnpm db:migrate`.
5. Validate and deploy commands explicitly.
6. Start the gateway and worker. Monitor `/readyz`, structured logs, and queue failures.

Production uses JSON logs. Do not put the health server on a public interface without a reverse proxy or network policy. Rotate a rejected Discord token in the Developer Portal; BLE Bot does not print it or endlessly retry invalid credentials.
