import { Events } from 'discord.js';

import { createCommandRegistry } from '../commands/index.js';
import { HelpInteractionHandler } from '../commands/help/help-interaction-handler.js';
import { InteractionRouter } from '../commands/framework/interaction-router.js';
import { createDiscordClient } from '../client/discord-client.js';
import { loadConfig, type AppConfig } from '../config/env.js';
import { ConfigurationError } from '../errors/domain-error.js';
import { BackupRepository } from '../features/backup/backup-repository.js';
import { BackupService } from '../features/backup/backup-service.js';
import { DiscordSnapshotProvider } from '../features/backup/discord-snapshot-provider.js';
import { ModerationRepository } from '../features/moderation/moderation-repository.js';
import { ModerationService } from '../features/moderation/moderation-service.js';
import { TicketRepository } from '../features/tickets/ticket-repository.js';
import { TicketInteractionHandler } from '../features/tickets/ticket-interaction-handler.js';
import { TicketService } from '../features/tickets/ticket-service.js';
import { RoleService } from '../features/roles/role-service.js';
import { PremiumService } from '../features/premium/premium-service.js';
import { SetupService } from '../features/setup/setup-service.js';
import { SetupInteractionHandler } from '../features/setup/setup-interaction-handler.js';
import { AuditResolver } from '../features/security/audit-resolver.js';
import { DiscordContainmentExecutor } from '../features/security/containment.js';
import { DiscordSecurityIngestor } from '../features/security/discord-ingestor.js';
import { PostgresSecurityRepository } from '../features/security/security-repository.js';
import { SecurityService } from '../features/security/security-service.js';
import { registerSecurityEvents } from '../events/discord/security-events.js';
import { Database } from '../infrastructure/database/database.js';
import { HealthServer } from '../infrastructure/health/health-server.js';
import { createLogger } from '../infrastructure/logging/logger.js';
import { Metrics } from '../infrastructure/metrics/metrics.js';
import { QueueService } from '../infrastructure/queue/queue-service.js';
import { RedisClient } from '../infrastructure/redis/redis.js';
import { RedisSlidingWindow } from '../infrastructure/redis/sliding-window.js';
import { LocalBackupStorage } from '../infrastructure/storage/local-backup-storage.js';
import { EmojiRegistry } from '../ui/emoji/emoji-registry.js';
import { Ui } from '../ui/ui.js';

const requireGatewayConfiguration = (config: AppConfig): void => {
  const missing = [
    config.discord.token ? undefined : 'DISCORD_TOKEN',
    config.discord.clientId ? undefined : 'DISCORD_CLIENT_ID',
    config.databaseUrl ? undefined : 'DATABASE_URL',
    config.redisUrl ? undefined : 'REDIS_URL'
  ].filter((value): value is string => Boolean(value));
  if (missing.length > 0)
    throw new ConfigurationError(`Gateway startup requires: ${missing.join(', ')}.`);
};

export const startGateway = async (): Promise<void> => {
  const config = loadConfig();
  requireGatewayConfiguration(config);
  const logger = createLogger(config);
  const startedAt = new Date();
  const database = new Database(config);
  const redis = new RedisClient(config);
  const metrics = new Metrics(config.metricsEnabled);
  const queues = new QueueService(redis.client, logger);
  const client = createDiscordClient(config);
  const emojis = new EmojiRegistry();
  const invalidEmojiKeys = emojis
    .status()
    .filter((status) => !status.valid)
    .map((status) => status.key);
  if (invalidEmojiKeys.length)
    logger.warn({ emojiKeys: invalidEmojiKeys }, 'Invalid BLE application emoji configuration');
  const ui = new Ui(emojis);
  const securityRepository = new PostgresSecurityRepository(database);
  const security = new SecurityService(
    securityRepository,
    new RedisSlidingWindow(redis.client),
    new DiscordContainmentExecutor((guildId) => client.guilds.cache.get(guildId)),
    logger,
    metrics
  );
  const setup = new SetupService(database);
  const moderationRepository = new ModerationRepository(database);
  const moderation = new ModerationService(moderationRepository);
  const ticketRepository = new TicketRepository(database);
  const tickets = new TicketService(ticketRepository);
  const roles = new RoleService();
  const premium = new PremiumService(database);
  const backupRepository = new BackupRepository(database);
  const backupService = new BackupService(
    new DiscordSnapshotProvider(),
    backupRepository,
    new LocalBackupStorage(config.storage.path, config.encryptionKey)
  );
  const registry = createCommandRegistry({
    ui,
    emojis,
    setup,
    security: securityRepository,
    backups: backupService,
    backupRepository,
    moderation,
    moderationRepository,
    tickets,
    ticketRepository,
    roles,
    premium,
    startedAt
  });
  const router = new InteractionRouter(registry, config, ui, logger, metrics, [
    new TicketInteractionHandler(tickets, ticketRepository, premium, ui),
    new SetupInteractionHandler(setup, ui),
    new HelpInteractionHandler(registry, ui)
  ]);
  const health = new HealthServer(config, logger, metrics, [
    { name: 'database', check: () => database.isReady() },
    { name: 'redis', check: () => redis.isReady() },
    { name: 'discord', check: () => Promise.resolve(client.isReady()) }
  ]);
  let closing = false;
  const shutdown = async (signal: string, exitCode: number): Promise<void> => {
    if (closing) return;
    closing = true;
    logger.info({ signal }, 'BLE Bot shutting down');
    await Promise.allSettled([
      health.close(),
      queues.close(),
      client.destroy(),
      redis.close(),
      database.close()
    ]);
    process.exitCode = exitCode;
  };
  process.once('SIGINT', () => {
    void shutdown('SIGINT', 0);
  });
  process.once('SIGTERM', () => {
    void shutdown('SIGTERM', 0);
  });
  process.once('unhandledRejection', (reason) => {
    logger.fatal({ err: reason }, 'Unhandled rejection');
    void shutdown('unhandledRejection', 1);
  });
  process.once('uncaughtException', (error) => {
    logger.fatal({ err: error }, 'Uncaught exception');
    void shutdown('uncaughtException', 1);
  });
  client.once(Events.ClientReady, (ready) => {
    logger.info(
      { userId: ready.user.id, tag: ready.user.tag, guilds: ready.guilds.cache.size },
      'BLE Bot gateway ready'
    );
  });
  client.on(Events.Error, (error) => logger.error({ err: error }, 'Discord client error'));
  router.attach(client);
  registerSecurityEvents(
    client,
    new DiscordSecurityIngestor(security, new AuditResolver(logger), logger),
    logger
  );
  await redis.connect();
  await health.start();
  try {
    await client.login(config.discord.token);
  } catch (error) {
    logger.fatal({ err: error }, 'Discord login failed. Rotate the token if it was rejected.');
    await shutdown('loginFailure', 1);
  }
};

export const startWorker = async (): Promise<void> => {
  const config = loadConfig();
  if (!config.databaseUrl || !config.redisUrl)
    throw new ConfigurationError('Worker startup requires DATABASE_URL and REDIS_URL.');
  const logger = createLogger(config);
  const redis = new RedisClient(config);
  const database = new Database(config);
  const queues = new QueueService(redis.client, logger);
  await redis.connect();
  logger.info(
    'BLE worker started; queue handlers are loaded by feature modules when those jobs are enabled.'
  );
  const stop = async (signal: string): Promise<void> => {
    logger.info({ signal }, 'BLE worker stopping');
    await Promise.allSettled([queues.close(), redis.close(), database.close()]);
  };
  process.once('SIGINT', () => {
    void stop('SIGINT');
  });
  process.once('SIGTERM', () => {
    void stop('SIGTERM');
  });
};
