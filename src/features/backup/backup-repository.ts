import { desc, eq } from 'drizzle-orm';

import type { Database } from '../../infrastructure/database/database.js';
import { backups, guilds } from '../../infrastructure/database/schema.js';

export type StoredBackup = Readonly<{
  id: string;
  guildId: string;
  checksum: string;
  storageKey: string;
  encrypted: boolean;
  status: 'PENDING' | 'COMPLETE' | 'INCOMPLETE' | 'DELETED';
}>;

export class BackupRepository {
  public constructor(private readonly database: Database) {}

  public async ensureGuild(guildId: string, name: string): Promise<void> {
    await this.database.db
      .insert(guilds)
      .values({ id: guildId, name })
      .onConflictDoUpdate({ target: guilds.id, set: { name, updatedAt: new Date() } });
  }

  public async create(
    input: StoredBackup & { createdBy: string; trigger: string; metadata: Record<string, unknown> }
  ): Promise<void> {
    await this.database.db.insert(backups).values({
      id: input.id,
      guildId: input.guildId,
      createdBy: input.createdBy,
      trigger: input.trigger,
      schemaVersion: 1,
      checksum: input.checksum,
      storageKey: input.storageKey,
      encrypted: input.encrypted,
      status: input.status,
      metadata: input.metadata
    });
  }

  public async get(id: string, guildId: string): Promise<StoredBackup | undefined> {
    const row = await this.database.db.query.backups.findFirst({ where: eq(backups.id, id) });
    if (!row || row.guildId !== guildId || row.deletedAt) return undefined;
    return {
      id: row.id,
      guildId: row.guildId,
      checksum: row.checksum,
      storageKey: row.storageKey,
      encrypted: row.encrypted,
      status: row.status
    };
  }

  public async list(guildId: string): Promise<readonly StoredBackup[]> {
    const rows = await this.database.db.query.backups.findMany({
      where: eq(backups.guildId, guildId),
      orderBy: [desc(backups.createdAt)]
    });
    return rows
      .filter((row) => !row.deletedAt)
      .map((row) => ({
        id: row.id,
        guildId: row.guildId,
        checksum: row.checksum,
        storageKey: row.storageKey,
        encrypted: row.encrypted,
        status: row.status
      }));
  }

  public async markDeleted(id: string, guildId: string): Promise<boolean> {
    const result = await this.database.db
      .update(backups)
      .set({ deletedAt: new Date(), status: 'DELETED' })
      .where(eq(backups.id, id))
      .returning({ id: backups.id, guildId: backups.guildId });
    return result.some((row) => row.guildId === guildId);
  }
}
