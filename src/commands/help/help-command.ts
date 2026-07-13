import { SlashCommandBuilder } from 'discord.js';

import type { Ui } from '../../ui/ui.js';
import type { Command, CommandContext } from '../framework/types.js';
import type { CommandRegistry } from '../framework/registry.js';

export const createHelpCommand = (registry: CommandRegistry, ui: Ui): Command => ({
  metadata: {
    name: 'help',
    category: 'utility',
    summary: 'Browse BLE Bot commands.',
    longDescription: 'Shows command families, command details, and searchable help.',
    examples: ['/help', '/help command:security'],
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
    .setName('help')
    .setDescription('Browse BLE Bot help.')
    .addStringOption((option) =>
      option.setName('command').setDescription('Command family to inspect.').setMaxLength(32)
    )
    .addStringOption((option) =>
      option.setName('search').setDescription('Search commands and aliases.').setMaxLength(48)
    ),
  async execute({ interaction }: CommandContext): Promise<void> {
    const requested =
      interaction.options.getString('command') ?? interaction.options.getString('search');
    const commands = registry.all().filter((command) => !command.metadata.hidden);
    const selected = requested
      ? commands.find((command) =>
          [command.metadata.name, ...(command.metadata.aliases ?? [])].some((value) =>
            value.toLowerCase().includes(requested.toLowerCase())
          )
        )
      : undefined;
    if (requested && !selected) {
      await interaction.reply({
        embeds: [
          ui.warning(
            'No matching command',
            'Use /help without options to view available command families.'
          )
        ],
        ephemeral: true
      });
      return;
    }
    if (selected) {
      const metadata = selected.metadata;
      await interaction.reply({
        embeds: [
          ui.info(
            `/${metadata.name}`,
            `${metadata.longDescription}\n\nExamples: ${metadata.examples.join(', ')}\nCooldown: ${metadata.defaultCooldownSeconds}s\nDangerous: ${metadata.dangerous ? 'Yes' : 'No'}\nConfirmation: ${metadata.confirmationRequired ? 'Required' : 'Not required'}`
          )
        ],
        ephemeral: true
      });
      return;
    }
    const byCategory = new Map<string, number>();
    for (const command of commands)
      byCategory.set(
        command.metadata.category,
        (byCategory.get(command.metadata.category) ?? 0) + 1
      );
    const summary = [...byCategory.entries()]
      .map(([category, count]) => `${category}: ${count}`)
      .join('\n');
    await interaction.reply({
      embeds: [
        ui.info(
          'BLE Bot help',
          `Version 0.1.0\nCommand families: ${commands.length}\n\n${summary}\n\nUse /help command:<family> for details.`
        )
      ],
      ephemeral: true
    });
  }
});
