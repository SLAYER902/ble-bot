import type { BackupRepository } from '../features/backup/backup-repository.js';
import type { BackupService } from '../features/backup/backup-service.js';
import type { SetupService } from '../features/setup/setup-service.js';
import type { SecurityPersistence } from '../features/security/security-repository.js';
import type { ModerationRepository } from '../features/moderation/moderation-repository.js';
import type { ModerationService } from '../features/moderation/moderation-service.js';
import type { TicketRepository } from '../features/tickets/ticket-repository.js';
import type { TicketService } from '../features/tickets/ticket-service.js';
import type { RoleService } from '../features/roles/role-service.js';
import type { PremiumService } from '../features/premium/premium-service.js';
import type { EmojiRegistry } from '../ui/emoji/emoji-registry.js';
import type { Ui } from '../ui/ui.js';
import { createBackupCommand } from './backup/backup-command.js';
import { createDeveloperCommand } from './developer/developer-command.js';
import { createHelpCommand } from './help/help-command.js';
import { createModerationCommand } from './moderation/moderation-command.js';
import { createPremiumCommand } from './premium/premium-command.js';
import { createRoleCommand } from './roles/role-command.js';
import { CommandRegistry } from './framework/registry.js';
import { createSecurityCommand } from './security/security-command.js';
import { createSetupCommand } from './setup/setup-command.js';
import { createTicketCommand } from './tickets/ticket-command.js';
import { createUtilityCommand } from './utility/utility-command.js';

export type CommandServices = Readonly<{
  ui: Ui;
  emojis: EmojiRegistry;
  setup: SetupService;
  security: SecurityPersistence;
  backups: BackupService;
  backupRepository: BackupRepository;
  moderation: ModerationService;
  moderationRepository: ModerationRepository;
  tickets: TicketService;
  ticketRepository: TicketRepository;
  roles: RoleService;
  premium: PremiumService;
  startedAt: Date;
}>;

export const createCommandRegistry = (services: CommandServices): CommandRegistry => {
  const registry = new CommandRegistry();
  registry.register(createHelpCommand(registry, services.ui));
  registry.register(createSetupCommand(services.setup, services.ui));
  registry.register(createSecurityCommand(services.security, services.ui));
  registry.register(createBackupCommand(services.backups, services.backupRepository, services.ui));
  registry.register(
    createModerationCommand(services.moderation, services.moderationRepository, services.ui)
  );
  registry.register(
    createTicketCommand(services.tickets, services.ticketRepository, services.premium, services.ui)
  );
  registry.register(createRoleCommand(services.roles, services.ui));
  registry.register(createPremiumCommand(services.premium, services.ticketRepository, services.ui));
  registry.register(createUtilityCommand(services.ui, services.startedAt));
  registry.register(createDeveloperCommand(services.emojis, services.ui));
  return registry;
};
