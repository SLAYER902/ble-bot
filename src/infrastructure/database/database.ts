import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

import type { AppConfig } from '../../config/env.js';
import { DatabaseUnavailableError } from '../../errors/domain-error.js';
import * as schema from './schema.js';

export class Database {
  public readonly pool: Pool;
  public readonly db: NodePgDatabase<typeof schema>;

  public constructor(config: AppConfig) {
    this.pool = new Pool({
      connectionString: config.databaseUrl,
      max: 12,
      application_name: 'ble-bot'
    });
    this.db = drizzle({ client: this.pool, schema });
  }

  public async isReady(): Promise<boolean> {
    try {
      await this.pool.query('SELECT 1');
      return true;
    } catch {
      return false;
    }
  }

  public async close(): Promise<void> {
    await this.pool.end();
  }

  public async transaction<T>(work: (db: NodePgDatabase<typeof schema>) => Promise<T>): Promise<T> {
    try {
      return await this.db.transaction(async (transaction) => work(transaction));
    } catch (error) {
      throw new DatabaseUnavailableError(error instanceof Error ? error : undefined);
    }
  }
}
