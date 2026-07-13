import { SlashCommandBuilder } from 'discord.js';

import type { Command, CommandContext } from '../framework/types.js';
import type { Ui } from '../../ui/ui.js';

export const createUtilityCommand = (ui: Ui, startedAt: Date): Command => ({
  metadata: {
    name: 'utility',
    category: 'utility',
    summary: 'Use safe bot and server utilities.',
    longDescription: 'Provides bot ping, uptime, and safe timestamp conversion utilities.',
    examples: ['/utility ping', '/utility uptime'],
    requiredUserPermissions: [],
    requiredBotPermissions: [],
    defaultCooldownSeconds: 3,
    premiumTier: 'free',
    guildOnly: false,
    ownerOnly: false,
    hidden: false,
    dangerous: false,
    confirmationRequired: false,
    ephemeral: true
  },
  data: new SlashCommandBuilder()
    .setName('utility')
    .setDescription('Use BLE Bot utilities.')
    .addSubcommand((subcommand) =>
      subcommand.setName('ping').setDescription('Check Discord gateway latency.')
    )
    .addSubcommand((subcommand) =>
      subcommand.setName('uptime').setDescription('Show BLE Bot process uptime.')
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('timestamp')
        .setDescription('Render a safe Discord timestamp.')
        .addIntegerOption((option) =>
          option
            .setName('unix')
            .setDescription('Unix time in seconds.')
            .setRequired(true)
            .setMinValue(0)
            .setMaxValue(4_102_444_800)
        )
    ),
  async execute({ interaction }: CommandContext): Promise<void> {
    const subcommand = interaction.options.getSubcommand();
    if (subcommand === 'ping') {
      await interaction.reply({
        embeds: [ui.info('BLE Bot latency', `Gateway latency: ${interaction.client.ws.ping} ms.`)],
        ephemeral: true
      });
      return;
    }
    if (subcommand === 'uptime') {
      const seconds = Math.floor((Date.now() - startedAt.getTime()) / 1_000);
      await interaction.reply({
        embeds: [ui.info('BLE Bot uptime', `Process uptime: ${seconds} seconds.`)],
        ephemeral: true
      });
      return;
    }
    const unix = interaction.options.getInteger('unix', true);
    await interaction.reply({
      embeds: [ui.info('Timestamp', `<t:${unix}:F>`)],
      ephemeral: true,
      allowedMentions: { parse: [] }
    });
  }
});
