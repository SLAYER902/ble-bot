import { PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';

import { PermissionDeniedError } from '../../errors/domain-error.js';
import type { BackupRepository } from '../../features/backup/backup-repository.js';
import type { BackupService } from '../../features/backup/backup-service.js';
import type { Ui } from '../../ui/ui.js';
import type { Command, CommandContext } from '../framework/types.js';

export const createBackupCommand = (
  service: BackupService,
  repository: BackupRepository,
  ui: Ui
): Command => ({
  metadata: {
    name: 'backup',
    category: 'backup',
    summary: 'Create, inspect, and compare structural server backups.',
    longDescription:
      'Creates versioned structural snapshots without message history or webhook tokens, verifies checksums, and provides a restore preview before changes are ever queued.',
    examples: ['/backup create', '/backup list', '/backup compare id:<backup-id>'],
    requiredUserPermissions: [PermissionFlagsBits.ManageGuild],
    requiredBotPermissions: [PermissionFlagsBits.ViewChannel],
    defaultCooldownSeconds: 30,
    premiumTier: 'free',
    guildOnly: true,
    ownerOnly: false,
    hidden: false,
    dangerous: false,
    confirmationRequired: false,
    ephemeral: true
  },
  data: new SlashCommandBuilder()
    .setName('backup')
    .setDescription('Manage BLE Backup snapshots.')
    .addSubcommand((subcommand) =>
      subcommand.setName('create').setDescription('Create a structural backup now.')
    )
    .addSubcommand((subcommand) =>
      subcommand.setName('list').setDescription('List recent backups.')
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('inspect')
        .setDescription('Verify and inspect a backup.')
        .addStringOption((option) =>
          option
            .setName('id')
            .setDescription('Backup ID.')
            .setRequired(true)
            .setMinLength(36)
            .setMaxLength(36)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('compare')
        .setDescription('Create a restore preview without changing the server.')
        .addStringOption((option) =>
          option
            .setName('id')
            .setDescription('Backup ID.')
            .setRequired(true)
            .setMinLength(36)
            .setMaxLength(36)
        )
    ),
  async execute({ interaction }: CommandContext): Promise<void> {
    if (!interaction.guild)
      throw new PermissionDeniedError('This command can only be used in a server.');
    const subcommand = interaction.options.getSubcommand();
    if (subcommand === 'create') {
      await interaction.deferReply({ ephemeral: true });
      const backup = await service.create(interaction.guild, interaction.user.id);
      await interaction.editReply({
        embeds: [
          ui.success(
            'Backup created',
            `Backup ID: ${backup.backupId}\nRoles: ${backup.resources.roles.length}\nChannels: ${backup.resources.channels.length}\nEncrypted: ${backup.encrypted ? 'Yes' : 'No'}\nChecksum: ${backup.checksum}`
          )
        ]
      });
      return;
    }
    if (subcommand === 'list') {
      const backups = await repository.list(interaction.guild.id);
      const description =
        backups.length === 0
          ? 'No active backups were found.'
          : backups
              .slice(0, 10)
              .map(
                (backup) =>
                  `${backup.id} | ${backup.status} | encrypted: ${backup.encrypted ? 'Yes' : 'No'}`
              )
              .join('\n');
      await interaction.reply({
        embeds: [ui.info('BLE Backup list', description)],
        ephemeral: true
      });
      return;
    }
    const id = interaction.options.getString('id', true);
    if (subcommand === 'inspect') {
      const backup = await service.inspect(interaction.guild.id, id);
      await interaction.reply({
        embeds: [
          ui.info(
            'Backup verified',
            `Backup ID: ${backup.backupId}\nCreated: ${backup.createdAt}\nTrigger: ${backup.trigger}\nRoles: ${backup.resources.roles.length}\nChannels: ${backup.resources.channels.length}\nIntegrity: Verified`
          )
        ],
        ephemeral: true
      });
      return;
    }
    await interaction.deferReply({ ephemeral: true });
    const plan = await service.planRestore(interaction.guild, id);
    await interaction.editReply({
      embeds: [
        ui.warning(
          'Restore preview',
          `Verified: ${plan.checksumVerified ? 'Yes' : 'No'}\nOperations: ${plan.operationCount}\nConflicts: ${plan.conflicts.length}\n\nNo changes have been made. A restore requires a separate confirmed, queued operation.`
        )
      ]
    });
  }
});
