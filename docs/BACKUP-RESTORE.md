# BLE Backup and restore

Backups are versioned structural snapshots of guild metadata, manageable role metadata, channel metadata, positions, and permission overwrites. They intentionally exclude message history and webhook tokens.

Resource content is canonicalized and SHA-256 checked. Local storage is AES-256-GCM encrypted when `ENCRYPTION_KEY` is configured. In production the encryption key is mandatory.

`/backup compare` verifies integrity, captures current state, and shows planned create, update, and move operations without changing Discord. A real restore must create a pre-restore snapshot, pass hierarchy preflight, use an idempotent queue, maintain old-to-new IDs, and require confirmation. Never assume a deleted Discord message can be restored.
