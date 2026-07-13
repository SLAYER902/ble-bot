# VPS guide

Install Docker from the official Docker documentation, clone the repository, and then run:

```bash
cp .env.example .env
chmod 600 .env
docker compose build
docker compose up -d postgres redis lavalink
docker compose run --rm bot node dist/scripts/migrate.js
docker compose run --rm bot node dist/scripts/deploy-commands.js --scope test
docker compose up -d bot worker
docker compose logs -f bot
```

Back up PostgreSQL with `docker compose exec postgres pg_dump -U ble ble > ble.sql`. Restore only during planned maintenance with `psql -U ble ble < ble.sql`. Rotate Discord, database, Redis, signing, and encryption secrets independently; changing the encryption key without re-encrypting old backup objects makes them unreadable.
