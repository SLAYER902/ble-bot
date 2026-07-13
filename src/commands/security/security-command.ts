import { PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';

import { PermissionDeniedError, ValidationError } from '../../errors/domain-error.js';
import type { SecurityPersistence } from '../../features/security/security-repository.js';
import type { Ui } from '../../ui/ui.js';
import type { Command, CommandContext } from '../framework/types.js';

export const createSecurityCommand = (repository: SecurityPersistence, ui: Ui): Command => ({
  metadata: {
    name: 'security',
    category: 'security',
    summary: 'Operate and inspect BLE Shield.',
    longDescription:
      'Shows BLE Shield safety state and lets authorized server managers enable monitored protection or select a containment mode.',
    examples: ['/security status', '/security enable', '/security mode mode:strict'],
    requiredUserPermissions: [PermissionFlagsBits.ManageGuild],
    requiredBotPermissions: [PermissionFlagsBits.ViewAuditLog],
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
    .setName('security')
    .setDescription('Manage BLE Shield.')
    .addSubcommand((subcommand) =>
      subcommand.setName('status').setDescription('View BLE Shield status.')
    )
    .addSubcommand((subcommand) =>
      subcommand.setName('enable').setDescription('Enable BLE Shield monitoring.')
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('mode')
        .setDescription('Set BLE Shield response mode.')
        .addStringOption((option) =>
          option
            .setName('mode')
            .setDescription('Response mode.')
            .setRequired(true)
            .addChoices(
              { name: 'Monitor', value: 'MONITOR' },
              { name: 'Balanced', value: 'BALANCED' },
              { name: 'Strict', value: 'STRICT' },
              { name: 'Custom', value: 'CUSTOM' }
            )
        )
    )
    .addSubcommand((subcommand) =>
      subcommand.setName('incident').setDescription('View the most recent open incident.')
    ),
  async execute({ interaction }: CommandContext): Promise<void> {
    if (!interaction.guild)
      throw new PermissionDeniedError('This command can only be used in a server.');
    const subcommand = interaction.options.getSubcommand();
    if (subcommand === 'enable') {
      await repository.ensureGuild(interaction.guild.id, interaction.guild.name);
      await repository.setEnabled(interaction.guild.id, true);
      await interaction.reply({
        embeds: [
          ui.success(
            'BLE Shield enabled',
            'Monitoring is enabled. Automated containment still requires high-confidence attribution, safe hierarchy, and an available Redis safety layer.'
          )
        ],
        ephemeral: true
      });
      return;
    }
    if (subcommand === 'mode') {
      const mode = interaction.options.getString('mode', true);
      if (!['MONITOR', 'BALANCED', 'STRICT', 'CUSTOM'].includes(mode))
        throw new ValidationError('Invalid BLE Shield mode.');
      await repository.ensureGuild(interaction.guild.id, interaction.guild.name);
      await repository.setMode(
        interaction.guild.id,
        mode as 'MONITOR' | 'BALANCED' | 'STRICT' | 'CUSTOM'
      );
      await interaction.reply({
        embeds: [ui.success('BLE Shield mode updated', `Response mode: ${mode}.`)],
        ephemeral: true
      });
      return;
    }
    if (subcommand === 'incident') {
      const incident = await repository.latestOpenIncident(interaction.guild.id);
      await interaction.reply({
        embeds: [
          incident
            ? ui.embed(
                'security',
                ui.labeled('BLE Shield incident', 'security'),
                `Incident: ${incident.publicId}\nRisk: ${incident.riskScore}\nState: ${incident.securityState}\nConfidence: ${incident.confidence}`
              )
            : ui.embed(
                'security',
                ui.labeled('BLE Shield incident', 'shield'),
                'There is no open security incident for this server.'
              )
        ],
        ephemeral: true
      });
      return;
    }
    const policy = await repository.getPolicy(interaction.guild.id);
    const me = interaction.guild.members.me;
    const hierarchy = me
      ? 'Role hierarchy must remain above every role BLE Shield is asked to manage.'
      : 'BLE Bot member data is not available yet.';
    await interaction.reply({
      embeds: [
        ui.embed(
          'security',
          ui.labeled('BLE Shield status', 'shield'),
          `Enabled: ${policy.enabled ? 'Yes' : 'No'}\nMode: ${policy.mode}\nState: ${policy.state}\nThresholds: alert ${policy.thresholds.observe}, contain ${policy.thresholds.contain}, emergency ${policy.thresholds.emergency}\n\n${hierarchy}`
        )
      ],
      ephemeral: true
    });
  }
});
