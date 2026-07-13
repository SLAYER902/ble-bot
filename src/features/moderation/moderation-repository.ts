import { desc, eq } from 'drizzle-orm';

import type { Database } from '../../infrastructure/database/database.js';
import { guilds, moderationCases } from '../../infrastructure/database/schema.js';

export type ModerationCase = Readonly<{
  id: string;
  guildId: string;
  targetId: string;
  moderatorId: string;
  action: string;
  reason: string;
  expiresAt?: Date;
  createdAt: Date;
}>;

export class ModerationRepository {
  public constructor(private readonly database: Database) {}

  public async ensureGuild(guildId: string, name: string): Promise<void> {
    await this.database.db
      .insert(guilds)
      .values({ id: guildId, name })
      .onConflictDoUpdate({ target: guilds.id, set: { name, updatedAt: new Date() } });
  }

  public async create(input: Omit<ModerationCase, 'id' | 'createdAt'>): Promise<ModerationCase> {
    const [record] = await this.database.db
      .insert(moderationCases)
      .values({
        guildId: input.guildId,
        targetId: input.targetId,
        moderatorId: input.moderatorId,
        action: input.action,
        reason: input.reason,
        expiresAt: input.expiresAt ?? null
      })
      .returning();
    if (!record) throw new Error('Unable to persist moderation case.');
    return {
      id: record.id,
      guildId: record.guildId,
      targetId: record.targetId,
      moderatorId: record.moderatorId,
      action: record.action,
      reason: record.reason,
      ...(record.expiresAt ? { expiresAt: record.expiresAt } : {}),
      createdAt: record.createdAt
    };
  }

  public async history(guildId: string, targetId: string): Promise<readonly ModerationCase[]> {
    const records = await this.database.db.query.moderationCases.findMany({
      where: eq(moderationCases.targetId, targetId),
      orderBy: [desc(moderationCases.createdAt)],
      limit: 20
    });
    return records
      .filter((record) => record.guildId === guildId)
      .map((record) => ({
        id: record.id,
        guildId: record.guildId,
        targetId: record.targetId,
        moderatorId: record.moderatorId,
        action: record.action,
        reason: record.reason,
        ...(record.expiresAt ? { expiresAt: record.expiresAt } : {}),
        createdAt: record.createdAt
      }));
  }
}
