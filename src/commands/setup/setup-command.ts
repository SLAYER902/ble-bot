import { PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';

import { PermissionDeniedError } from '../../errors/domain-error.js';
import type { SetupService } from '../../features/setup/setup-service.js';
import type { Ui } from '../../ui/ui.js';
import type { Command, CommandContext } from '../framework/types.js';

const setupLinks = [
  {
    label: 'Setup guide',
    url: 'https://github.com/SLAYER902/ble-bot/blob/main/docs/DEPLOYMENT.md',
    emoji: 'guide'
  },
  {
    label: 'Security model',
    url: 'https://github.com/SLAYER902/ble-bot/blob/main/docs/SECURITY-MODEL.md',
    emoji: 'security'
  }
] as const;

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
      const embed = ui
        .embed(
          'info',
          ui.labeled('Setup workspace created', 'guide'),
          `Your configuration is saved and can be resumed at any time. **Step ${progress.step} of 17** is now active.`
        )
        .addFields(
          {
            name: ui.labeled('01 — Verify the baseline', 'staff'),
            value: 'Run `/setup diagnostics` to confirm permissions and role hierarchy.',
            inline: false
          },
          {
            name: ui.labeled('02 — Set your security posture', 'shield'),
            value: 'Use `/security status` to review protection before enabling safeguards.',
            inline: false
          },
          {
            name: ui.labeled('03 — Prepare recovery', 'backup'),
            value: 'Use `/backup create` after configuration to capture a safe baseline.',
            inline: false
          }
        )
        .setFooter({ text: 'BLE // Your setup state is saved automatically' });
      await interaction.reply({
        embeds: [embed],
        components: [ui.resourceLinks(...setupLinks)],
        ephemeral: true
      });
      return;
    }
    if (subcommand === 'status') {
      const progress = await service.status(interaction.guild.id);
      const description =
        progress.step === 0
          ? 'No saved setup exists for this server yet. Start when you are ready to configure BLE.'
          : `Your saved configuration is active. **Step ${progress.step} of 17** is the current checkpoint.`;
      const embed = ui
        .embed('info', ui.labeled('Setup progress', 'settings'), description)
        .addFields(
          {
            name: 'Workspace state',
            value: progress.completed
              ? 'Complete — review `/security status` regularly.'
              : 'In progress — your changes are preserved.',
            inline: true
          },
          {
            name: 'Recommended next action',
            value: progress.step === 0 ? '`/setup start`' : '`/setup diagnostics`',
            inline: true
          }
        )
        .setFooter({ text: 'BLE // Setup never overwrites your saved configuration' });
      await interaction.reply({
        embeds: [embed],
        components: [ui.resourceLinks(...setupLinks)],
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
