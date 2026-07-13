import { PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';

import { PermissionDeniedError } from '../../errors/domain-error.js';
import type { SetupService } from '../../features/setup/setup-service.js';
import type { Ui } from '../../ui/ui.js';
import type { Command, CommandContext } from '../framework/types.js';

const setupSection = (step: number): string => {
  if (step <= 1) return 'Baseline verification';
  if (step <= 3) return 'Security posture';
  if (step <= 5) return 'Recovery and backups';
  if (step <= 8) return 'Moderation and tickets';
  if (step <= 12) return 'Community modules';
  return 'Review and completion';
};

export const createSetupCommand = (service: SetupService, ui: Ui): Command => ({
  metadata: {
    name: 'setup',
    category: 'management',
    summary: 'Start and inspect BLE Bot setup.',
    longDescription: 'Persists a resumable server setup workflow and surfaces its current state.',
    examples: ['/setup start', '/setup continue', '/setup status'],
    requiredUserPermissions: [PermissionFlagsBits.ManageGuild],
    requiredBotPermissions: [],
    defaultCooldownSeconds: 5,
    premiumTier: 'free',
    guildOnly: true,
    ownerOnly: false,
    hidden: false,
    dangerous: false,
    confirmationRequired: false,
    ephemeral: true
  },
  data: new SlashCommandBuilder()
    .setName('setup')
    .setDescription('Configure BLE Bot.')
    .addSubcommand((subcommand) =>
      subcommand.setName('start').setDescription('Open the resumable BLE setup centre.')
    )
    .addSubcommand((subcommand) =>
      subcommand.setName('status').setDescription('View setup progress.')
    )
    .addSubcommand((subcommand) =>
      subcommand.setName('diagnostics').setDescription('View the local setup prerequisites.')
    )
    .addSubcommand((subcommand) =>
      subcommand.setName('continue').setDescription('Advance to the next saved setup checkpoint.')
    )
    .addSubcommand((subcommand) =>
      subcommand.setName('export').setDescription('Export the current setup state for review.')
    ),
  async execute({ interaction }: CommandContext): Promise<void> {
    if (!interaction.guild)
      throw new PermissionDeniedError('This command can only be used in a server.');
    const subcommand = interaction.options.getSubcommand();
    if (subcommand === 'start') {
      const progress = await service.start(interaction.guild.id, interaction.guild.name);
      await interaction.reply({
        ...ui.setupControlPanel({ ...progress, currentSection: setupSection(progress.step) }),
        ephemeral: true
      });
      return;
    }
    if (subcommand === 'status') {
      const progress = await service.status(interaction.guild.id);
      await interaction.reply({
        ...ui.setupControlPanel({ ...progress, currentSection: setupSection(progress.step) }),
        ephemeral: true
      });
      return;
    }
    if (subcommand === 'continue') {
      const current = await service.status(interaction.guild.id);
      const started =
        current.step === 0
          ? await service.start(interaction.guild.id, interaction.guild.name)
          : current;
      const nextStep = Math.min(started.step + 1, 17);
      const progress = await service.advance(interaction.guild.id, nextStep, nextStep === 17);
      await interaction.reply({
        ...ui.setupControlPanel({ ...progress, currentSection: setupSection(progress.step) }),
        ephemeral: true
      });
      return;
    }
    if (subcommand === 'export') {
      const progress = await service.status(interaction.guild.id);
      await interaction.reply({
        embeds: [
          ui.page('info', {
            title: ui.labeled('Setup state export', 'documentation'),
            description: `Server: ${interaction.guild.name}\nProgress: ${progress.step} of 17\nState: ${progress.completed ? 'Complete' : 'In progress'}\nCurrent section: ${setupSection(progress.step)}`,
            footer:
              'This export contains setup state only. It never includes secrets or private configuration values.'
          })
        ],
        ephemeral: true
      });
      return;
    }
    const me = interaction.guild.members.me;
    const missing = [
      !me?.permissions.has(PermissionFlagsBits.ViewAuditLog) ? 'View Audit Log' : undefined,
      !me?.permissions.has(PermissionFlagsBits.ManageRoles) ? 'Manage Roles' : undefined,
      !me?.permissions.has(PermissionFlagsBits.ManageWebhooks) ? 'Manage Webhooks' : undefined
    ].filter((value): value is string => Boolean(value));
    await interaction.reply({
      embeds: [
        ui.diagnostics(
          'Setup diagnostics',
          missing.length === 0
            ? 'Core Discord permissions are present. Role hierarchy and dependency checks are available in /security status.'
            : `Missing bot permissions: ${missing.join(', ')}. Move the BLE Bot role above roles it must protect, then run this command again.`
        )
      ],
      ephemeral: true
    });
  }
});
