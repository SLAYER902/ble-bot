import { z } from 'zod';

import { ConfigurationError } from '../errors/domain-error.js';

const booleanFromEnvironment = z.enum(['true', 'false']).transform((value) => value === 'true');
const optionalText = z.string().trim().optional().default('');

const rawSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DISCORD_TOKEN: optionalText,
  DISCORD_CLIENT_ID: optionalText,
  DISCORD_TEST_GUILD_ID: optionalText,
  DISCORD_OWNER_IDS: optionalText,
  DATABASE_URL: optionalText,
  REDIS_URL: optionalText,
  ENCRYPTION_KEY: optionalText,
  SIGNING_SECRET: optionalText,
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  HEALTH_HOST: z.string().default('127.0.0.1'),
  HEALTH_PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  LAVALINK_HOST: z.string().default('lavalink'),
  LAVALINK_PORT: z.coerce.number().int().min(1).max(65535).default(2333),
  LAVALINK_PASSWORD: optionalText,
  LAVALINK_SECURE: booleanFromEnvironment.default(false),
  AI_PROVIDER: z.enum(['disabled', 'openai-compatible']).default('disabled'),
  AI_BASE_URL: optionalText,
  AI_API_KEY: optionalText,
  AI_MODEL: optionalText,
  AI_TIMEOUT_MS: z.coerce.number().int().min(1_000).max(120_000).default(30_000),
  OBJECT_STORAGE_DRIVER: z.enum(['local']).default('local'),
  OBJECT_STORAGE_PATH: z.string().default('./storage'),
  SENTRY_DSN: optionalText,
  METRICS_ENABLED: booleanFromEnvironment.default(true),
  GUILD_MEMBERS_INTENT_ENABLED: booleanFromEnvironment.default(false),
  MESSAGE_CONTENT_ENABLED: booleanFromEnvironment.default(false),
  REACTION_FEATURES_ENABLED: booleanFromEnvironment.default(false)
});

export type AppConfig = Readonly<{
  environment: 'development' | 'test' | 'production';
  discord: {
    token: string;
    clientId: string;
    testGuildId?: string;
    ownerIds: ReadonlySet<string>;
    guildMembersIntentEnabled: boolean;
  };
  databaseUrl: string;
  redisUrl: string;
  encryptionKey?: string;
  signingSecret?: string;
  logLevel: 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace';
  health: { host: string; port: number };
  lavalink: { host: string; port: number; password?: string; secure: boolean };
  ai: {
    provider: 'disabled' | 'openai-compatible';
    baseUrl?: string;
    apiKey?: string;
    model?: string;
    timeoutMs: number;
  };
  storage: { driver: 'local'; path: string };
  metricsEnabled: boolean;
  messageContentEnabled: boolean;
  reactionFeaturesEnabled: boolean;
}>;

const requireInProduction = (value: string, name: string, errors: string[]): void => {
  if (value.length === 0) errors.push(name);
};

const parseOwnerIds = (value: string): ReadonlySet<string> =>
  new Set(
    value
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean)
  );

export const loadConfig = (source: NodeJS.ProcessEnv = process.env): AppConfig => {
  const parsed = rawSchema.safeParse(source);
  if (!parsed.success) {
    const fields = parsed.error.issues.map((issue) => issue.path.join('.')).join(', ');
    throw new ConfigurationError(`Invalid environment configuration: ${fields}.`);
  }

  const value = parsed.data;
  const errors: string[] = [];
  if (value.NODE_ENV === 'production') {
    requireInProduction(value.DISCORD_TOKEN, 'DISCORD_TOKEN', errors);
    requireInProduction(value.DISCORD_CLIENT_ID, 'DISCORD_CLIENT_ID', errors);
    requireInProduction(value.DATABASE_URL, 'DATABASE_URL', errors);
    requireInProduction(value.REDIS_URL, 'REDIS_URL', errors);
    requireInProduction(value.ENCRYPTION_KEY, 'ENCRYPTION_KEY', errors);
    requireInProduction(value.SIGNING_SECRET, 'SIGNING_SECRET', errors);
    if (value.ENCRYPTION_KEY && Buffer.from(value.ENCRYPTION_KEY, 'base64').length !== 32) {
      errors.push('ENCRYPTION_KEY must decode to 32 bytes');
    }
  }
  if (value.AI_PROVIDER === 'openai-compatible') {
    requireInProduction(value.AI_BASE_URL, 'AI_BASE_URL', errors);
    requireInProduction(value.AI_API_KEY, 'AI_API_KEY', errors);
    requireInProduction(value.AI_MODEL, 'AI_MODEL', errors);
  }
  if (errors.length > 0) {
    throw new ConfigurationError(
      `Required configuration is missing or invalid: ${errors.join(', ')}.`
    );
  }

  return {
    environment: value.NODE_ENV,
    discord: {
      token: value.DISCORD_TOKEN,
      clientId: value.DISCORD_CLIENT_ID,
      ...(value.DISCORD_TEST_GUILD_ID ? { testGuildId: value.DISCORD_TEST_GUILD_ID } : {}),
      ownerIds: parseOwnerIds(value.DISCORD_OWNER_IDS),
      guildMembersIntentEnabled: value.GUILD_MEMBERS_INTENT_ENABLED
    },
    databaseUrl: value.DATABASE_URL,
    redisUrl: value.REDIS_URL,
    ...(value.ENCRYPTION_KEY ? { encryptionKey: value.ENCRYPTION_KEY } : {}),
    ...(value.SIGNING_SECRET ? { signingSecret: value.SIGNING_SECRET } : {}),
    logLevel: value.LOG_LEVEL,
    health: { host: value.HEALTH_HOST, port: value.HEALTH_PORT },
    lavalink: {
      host: value.LAVALINK_HOST,
      port: value.LAVALINK_PORT,
      ...(value.LAVALINK_PASSWORD ? { password: value.LAVALINK_PASSWORD } : {}),
      secure: value.LAVALINK_SECURE
    },
    ai: {
      provider: value.AI_PROVIDER,
      ...(value.AI_BASE_URL ? { baseUrl: value.AI_BASE_URL } : {}),
      ...(value.AI_API_KEY ? { apiKey: value.AI_API_KEY } : {}),
      ...(value.AI_MODEL ? { model: value.AI_MODEL } : {}),
      timeoutMs: value.AI_TIMEOUT_MS
    },
    storage: { driver: value.OBJECT_STORAGE_DRIVER, path: value.OBJECT_STORAGE_PATH },
    metricsEnabled: value.METRICS_ENABLED,
    messageContentEnabled: value.MESSAGE_CONTENT_ENABLED,
    reactionFeaturesEnabled: value.REACTION_FEATURES_ENABLED
  };
};
