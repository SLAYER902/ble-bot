import 'dotenv/config';
import { migrate } from 'drizzle-orm/node-postgres/migrator';

import { loadConfig } from '../src/config/env.js';
import { Database } from '../src/infrastructure/database/database.js';

const config = loadConfig();
if (!config.databaseUrl) throw new Error('DATABASE_URL is required for migrations.');
const database = new Database(config);
try {
  await migrate(database.db, { migrationsFolder: 'drizzle' });
  console.log('Database migrations applied.');
} finally {
  await database.close();
}
