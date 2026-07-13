import { loadConfig } from '../src/config/env.js';
import { createCommandRegistry, type CommandServices } from '../src/commands/index.js';
import { BackupRepository } from '../src/features/backup/backup-repository.js';
import { BackupService } from '../src/features/backup/backup-service.js';
import { DiscordSnapshotProvider } from '../src/features/backup/discord-snapshot-provider.js';
import { ModerationRepository } from '../src/features/moderation/moderation-repository.js';
import { ModerationService } from '../src/features/moderation/moderation-service.js';
import { TicketRepository } from '../src/features/tickets/ticket-repository.js';
import { TicketService } from '../src/features/tickets/ticket-service.js';
import { RoleService } from '../src/features/roles/role-service.js';
import { SetupService } from '../src/features/setup/setup-service.js';
import { PostgresSecurityRepository } from '../src/features/security/security-repository.js';
import { Database } from '../src/infrastructure/database/database.js';
import { LocalBackupStorage } from '../src/infrastructure/storage/local-backup-storage.js';
import { EmojiRegistry } from '../src/ui/emoji/emoji-registry.js';
import { Ui } from '../src/ui/ui.js';

export const commandsForScripts = () => {
  const config = loadConfig();
  const database = new Database(config);
  const emojis = new EmojiRegistry();
  const moderationRepository = new ModerationRepository(database);
  const ticketRepository = new TicketRepository(database);
  const services: CommandServices = {
    ui: new Ui(emojis),
    emojis,
    setup: new SetupService(database),
    security: new PostgresSecurityRepository(database),
    backups: new BackupService(
      new DiscordSnapshotProvider(),
      new BackupRepository(database),
      new LocalBackupStorage(config.storage.path, config.encryptionKey)
    ),
    backupRepository: new BackupRepository(database),
    moderation: new ModerationService(moderationRepository),
    moderationRepository,
    tickets: new TicketService(ticketRepository),
    ticketRepository,
    roles: new RoleService(),
    startedAt: new Date()
  };
  return createCommandRegistry(services);
};
