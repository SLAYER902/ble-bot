import { SlashCommandBuilder } from 'discord.js';

import type { PremiumService } from '../../features/premium/premium-service.js';
import type { TicketRepository } from '../../features/tickets/ticket-repository.js';
import type { Ui } from '../../ui/ui.js';
import type { Command, CommandContext } from '../framework/types.js';

export const createPremiumCommand = (
  premium: PremiumService,
  tickets: TicketRepository,
  ui: Ui
): Command => ({
  metadata: {
    name: 'premium',
    category: 'community',
    summary: 'View BLE plan limits and current usage.',
    longDescription:
      'Shows Free and Premium limits without creating a fake purchase flow. Core BLE protections remain available on the Free plan.',
    examples: ['/premium status', '/premium compare'],
    requiredUserPermissions: [],
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
    .setName('premium')
    .setDescription('View BLE plan status and limits.')
    .addSubcommand((subcommand) =>
      subcommand.setName('status').setDescription('View this server plan.')
    )
    .addSubcommand((subcommand) =>
      subcommand.setName('features').setDescription('View plan features.')
    )
    .addSubcommand((subcommand) =>
      subcommand.setName('compare').setDescription('Compare Free and Premium limits.')
    ),
  async execute({ interaction }: CommandContext): Promise<void> {
    if (!interaction.guild) return;
    const status = await premium.status(interaction.guild.id);
    const panels = await tickets.countPanels(interaction.guild.id);
    const subcommand = interaction.options.getSubcommand();
    if (subcommand === 'status') {
      await interaction.reply({
        embeds: [
          ui.page('info', {
            title: ui.labeled('BLE plan status', 'premium'),
            description: `Current plan: ${status.plan}\nTicket panels: ${panels} of ${status.limits.ticketPanels}`,
            fields: [
              {
                name: 'Open tickets per member',
                value: String(status.limits.openTicketsPerUser),
                inline: true
              },
              {
                name: 'Manual backups stored',
                value: String(status.limits.manualBackupsStored),
                inline: true
              },
              {
                name: 'AI credits each month',
                value: String(status.limits.aiCreditsMonthly),
                inline: true
              }
            ],
            footer: status.expiresAt
              ? `Entitlement expires ${status.expiresAt.toISOString()}`
              : 'Billing is not configured in BLE Bot. No purchase button is shown.'
          })
        ],
        ephemeral: true
      });
      return;
    }
    if (subcommand === 'features') {
      await interaction.reply({
        embeds: [
          ui.page('info', {
            title: ui.labeled('BLE plan features', 'premium'),
            description:
              'Free includes BLE Shield core monitoring, moderation, ticket panels, backups, music controls when available, and temporary voice features when available.',
            fields: [
              {
                name: 'Free plan',
                value: 'Core safety and normal server operation remain available.'
              },
              {
                name: 'Premium improvements',
                value: 'Higher limits, automation, retention, and configuration range.'
              }
            ]
          })
        ],
        ephemeral: true
      });
      return;
    }
    await interaction.reply({
      embeds: [
        ui.page('info', {
          title: ui.labeled('BLE plan comparison', 'premium'),
          description:
            'Premium expands capacity; it does not remove core protection from Free servers.',
          fields: [
            { name: 'Ticket panels', value: `Free: 1\nPremium: 10`, inline: true },
            { name: 'Open tickets per member', value: `Free: 2\nPremium: 10`, inline: true },
            { name: 'Transcript retention', value: `Free: 7 days\nPremium: 90 days`, inline: true },
            { name: 'Music limits', value: `Free queue: 50\nPremium queue: 500`, inline: true },
            { name: 'Voice templates', value: `Free: 1\nPremium: 20`, inline: true },
            { name: 'Purchase availability', value: 'Billing is not configured in BLE Bot.' }
          ]
        })
      ],
      ephemeral: true
    });
  }
});
