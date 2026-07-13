import { SlashCommandBuilder } from 'discord.js';

import type { EmojiRegistry } from '../../ui/emoji/emoji-registry.js';
import type { Ui } from '../../ui/ui.js';
import type { Command, CommandContext } from '../framework/types.js';

export const createDeveloperCommand = (emojis: EmojiRegistry, ui: Ui): Command => ({
  metadata: {
    name: 'developer',
    category: 'developer',
    summary: 'Inspect owner-only BLE Bot diagnostics.',
    longDescription: 'Shows application emoji configuration without exposing secret configuration.',
    examples: ['/developer emoji-status'],
    requiredUserPermissions: [],
    requiredBotPermissions: [],
    defaultCooldownSeconds: 5,
    premiumTier: 'free',
    guildOnly: false,
    ownerOnly: true,
    hidden: true,
    dangerous: false,
    confirmationRequired: false,
    ephemeral: true
  },
  data: new SlashCommandBuilder()
    .setName('developer')
    .setDescription('BLE Bot owner diagnostics.')
    .addSubcommand((subcommand) =>
      subcommand
        .setName('emoji-status')
        .setDescription('Show configured BLE application emoji status.')
    )
    .addSubcommand((subcommand) =>
      subcommand.setName('status').setDescription('Show owner-visible application status.')
    ),
  async execute({ interaction }: CommandContext): Promise<void> {
    const subcommand = interaction.options.getSubcommand();
    if (subcommand === 'emoji-status') {
      const application = interaction.client.application;
      const available = application
        ? new Set((await application.emojis.fetch()).keys())
        : new Set<string>();
      const status = emojis.status(available);
      const configured = status.filter(
        (entry) => entry.configured && entry.valid && entry.available
      ).length;
      const invalid = status.filter((entry) => !entry.valid).map((entry) => entry.key);
      const missing = status.filter((entry) => !entry.configured).map((entry) => entry.key);
      await interaction.reply({
        embeds: [
          ui.embed(
            'info',
            ui.labeled('BLE application emoji status', 'developer'),
            `Available: ${configured}\nMissing configuration: ${missing.join(', ') || 'None'}\nInvalid configuration: ${invalid.join(', ') || 'None'}`
          )
        ],
        ephemeral: true
      });
      return;
    }
    await interaction.reply({
      embeds: [
        ui.embed(
          'info',
          ui.labeled('BLE Bot developer status', 'owner'),
          `Connected guilds: ${interaction.client.guilds.cache.size}\nGateway ping: ${interaction.client.ws.ping} ms.`
        )
      ],
      ephemeral: true
    });
  }
});
