import { eq } from 'drizzle-orm';

import type { Database } from '../../infrastructure/database/database.js';
import { guildSettings, guilds } from '../../infrastructure/database/schema.js';

export type SetupProgress = Readonly<{ step: number; completed: boolean }>;

export class SetupService {
  public constructor(private readonly database: Database) {}

  public async start(guildId: string, guildName: string): Promise<SetupProgress> {
    await this.database.transaction(async (db) => {
      await db
        .insert(guilds)
        .values({ id: guildId, name: guildName })
        .onConflictDoUpdate({ target: guilds.id, set: { name: guildName, updatedAt: new Date() } });
      await db
        .insert(guildSettings)
        .values({ guildId, setupStep: 1, setupCompleted: false })
        .onConflictDoUpdate({
          target: guildSettings.guildId,
          set: { setupStep: 1, setupCompleted: false, updatedAt: new Date() }
        });
    });
    return { step: 1, completed: false };
  }

  public async status(guildId: string): Promise<SetupProgress> {
    const result = await this.database.db.query.guildSettings.findFirst({
      where: eq(guildSettings.guildId, guildId)
    });
    return result
      ? { step: result.setupStep, completed: result.setupCompleted }
      : { step: 0, completed: false };
  }

  public async advance(guildId: string, step: number, completed = false): Promise<SetupProgress> {
    const safeStep = Math.max(0, Math.min(step, 17));
    await this.database.db
      .update(guildSettings)
      .set({ setupStep: safeStep, setupCompleted: completed, updatedAt: new Date() })
      .where(eq(guildSettings.guildId, guildId));
    return { step: safeStep, completed };
  }
}
