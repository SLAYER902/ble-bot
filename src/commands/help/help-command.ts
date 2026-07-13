import { SlashCommandBuilder } from 'discord.js';

import type { Ui } from '../../ui/ui.js';
import type { Command, CommandContext } from '../framework/types.js';
import type { CommandRegistry } from '../framework/registry.js';

const categoryLabels: Readonly<Record<string, string>> = {
  security: 'Security controls',
  backup: 'Backups and recovery',
  moderation: 'Moderation tools',
  management: 'Server management',
  community: 'Community tools',
  utility: 'Utilities',
  music: 'Music',
  ai: 'AI tools',
  developer: 'Developer tools'
};

const documentationLinks = [
  {
    label: 'Documentation',
    url: 'https://github.com/SLAYER902/ble-bot#readme',
    emoji: 'documentation'
  },
  {
    label: 'Security model',
    url: 'https://github.com/SLAYER902/ble-bot/blob/main/docs/SECURITY-MODEL.md',
    emoji: 'security'
  }
] as const;

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
      const embed = ui
        .embed('info', ui.labeled(`/${metadata.name}`, 'information'), metadata.longDescription)
        .addFields(
          {
            name: 'Try it',
            value: metadata.examples.map((example) => `• ${example}`).join('\n')
          },
          {
            name: 'Command profile',
            value: [
              `Cooldown: ${metadata.defaultCooldownSeconds}s`,
              `Safety confirmation: ${metadata.confirmationRequired ? 'Required' : 'Not required'}`,
              `Risk level: ${metadata.dangerous ? 'Elevated' : 'Standard'}`
            ].join('\n')
          }
        )
        .setFooter({ text: 'BLE // Use /help to return to the command center' });
      await interaction.reply({
        embeds: [embed],
        components: [ui.resourceLinks(...documentationLinks)],
        ephemeral: true
      });
      return;
    }
    const byCategory = new Map<string, typeof commands>();
    for (const command of commands) {
      const category = command.metadata.category;
      const listed = byCategory.get(category) ?? [];
      listed.push(command);
      byCategory.set(category, listed);
    }
    const fields = [...byCategory.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([category, listed]) => ({
        name: categoryLabels[category] ?? category,
        value: listed
          .sort((left, right) => left.metadata.name.localeCompare(right.metadata.name))
          .map((command) => `**/${command.metadata.name}** — ${command.metadata.summary}`)
          .join('\n'),
        inline: false
      }));
    const embed = ui
      .embed(
        'info',
        ui.labeled('BLE command center', 'settings'),
        `**${commands.length} command families, built for safe server operations.**\n\nStart with \`/setup start\` to create a saved server plan, or open a focused guide with \`/help command:<family>\`.`
      )
      .addFields(fields)
      .setFooter({ text: 'BLE // Command guides are private to you' });
    await interaction.reply({
      embeds: [embed],
      components: [ui.resourceLinks(...documentationLinks)],
      ephemeral: true
    });
  }
});
