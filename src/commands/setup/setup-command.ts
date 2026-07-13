import { PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';

import { PermissionDeniedError } from '../../errors/domain-error.js';
import type { SetupService } from '../../features/setup/setup-service.js';
import type { Ui } from '../../ui/ui.js';
import type { Command, CommandContext } from '../framework/types.js';

export const createSetupCommand = (service: SetupService, ui: Ui): Command => ({
  metadata: {
    name: 'setup',
    category: 'management',
    summary: 'Start and inspect BLE Bot setup.',
    longDescription: 'Persists a resumable server setup workflow and surfaces its current state.',
    examples: ['/setup start', '/setup status'],
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
      subcommand.setName('start').setDescription('Start or restart the resumable setup workflow.')
    )
    .addSubcommand((subcommand) =>
      subcommand.setName('status').setDescription('View setup progress.')
    )
    .addSubcommand((subcommand) =>
      subcommand.setName('diagnostics').setDescription('View the local setup prerequisites.')
    ),
  async execute({ interaction }: CommandContext): Promise<void> {
    if (!interaction.guild)
      throw new PermissionDeniedError('This command can only be used in a server.');
    const subcommand = interaction.options.getSubcommand();
    if (subcommand === 'start') {
      const progress = await service.start(interaction.guild.id, interaction.guild.name);
      await interaction.reply({
        embeds: [
          ui.info(
            'Setup started',
            `Setup progress is saved. Current step: ${progress.step} of 17. Configure security, logs, trusted administrators, and feature modules through the available command families.`
          )
        ],
        ephemeral: true
      });
      return;
    }
    if (subcommand === 'status') {
      const progress = await service.status(interaction.guild.id);
      await interaction.reply({
        embeds: [
          ui.diagnostics(
            'Setup status',
            progress.step === 0
              ? 'Setup has not been started.'
              : `Current step: ${progress.step} of 17. Completed: ${progress.completed ? 'Yes' : 'No'}.`
          )
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
