import { PermissionFlagsBits, SlashCommandBuilder, TextChannel } from 'discord.js';

import { PermissionDeniedError } from '../../errors/domain-error.js';
import type { TicketRepository } from '../../features/tickets/ticket-repository.js';
import type { TicketService } from '../../features/tickets/ticket-service.js';
import type { Ui } from '../../ui/ui.js';
import type { Command, CommandContext } from '../framework/types.js';

const currentTextTicketChannel = (context: CommandContext): TextChannel => {
  const channel = context.interaction.channel;
  if (!(channel instanceof TextChannel))
    throw new PermissionDeniedError(
      'This action must be used inside a standard text ticket channel.'
    );
  return channel;
};

export const createTicketCommand = (
  service: TicketService,
  repository: TicketRepository,
  ui: Ui
): Command => ({
  metadata: {
    name: 'ticket',
    category: 'management',
    summary: 'Create and manage private BLE support tickets.',
    longDescription:
      'Creates private text channels for ticket openers, persists lifecycle state, enforces an open-ticket limit, and supports staff claim workflows.',
    examples: ['/ticket create subject:Need help', '/ticket close'],
    requiredUserPermissions: [],
    requiredBotPermissions: [PermissionFlagsBits.ManageChannels],
    defaultCooldownSeconds: 15,
    premiumTier: 'free',
    guildOnly: true,
    ownerOnly: false,
    hidden: false,
    dangerous: false,
    confirmationRequired: false,
    ephemeral: true
  },
  data: new SlashCommandBuilder()
    .setName('ticket')
    .setDescription('Manage BLE Tickets.')
    .addSubcommand((subcommand) =>
      subcommand
        .setName('create')
        .setDescription('Open a private support ticket.')
        .addStringOption((option) =>
          option
            .setName('subject')
            .setDescription('Short ticket subject.')
            .setRequired(true)
            .setMaxLength(120)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand.setName('close').setDescription('Close the current ticket.')
    )
    .addSubcommand((subcommand) =>
      subcommand.setName('reopen').setDescription('Reopen the current ticket.')
    )
    .addSubcommand((subcommand) =>
      subcommand.setName('claim').setDescription('Claim the current ticket as support staff.')
    )
    .addSubcommand((subcommand) =>
      subcommand.setName('unclaim').setDescription('Remove the current ticket claim.')
    )
    .addSubcommand((subcommand) =>
      subcommand.setName('list').setDescription('List your ticket channels.')
    ),
  async execute(context: CommandContext): Promise<void> {
    const { interaction } = context;
    if (!interaction.guild || !interaction.client.user)
      throw new PermissionDeniedError(
        'This command can only be used in a server after BLE Bot is ready.'
      );
    const subcommand = interaction.options.getSubcommand();
    if (subcommand === 'create') {
      await interaction.deferReply({ ephemeral: true });
      const member = await interaction.guild.members.fetch(interaction.user.id);
      const ticket = await service.create(
        interaction.guild,
        member,
        interaction.client.user.id,
        interaction.options.getString('subject', true)
      );
      await interaction.editReply({
        embeds: [ui.success('Ticket created', `Your private ticket is <#${ticket.channelId}>.`)]
      });
      return;
    }
    if (subcommand === 'list') {
      const tickets = await repository.listForUser(interaction.guild.id, interaction.user.id);
      const description =
        tickets.length === 0
          ? 'You have no ticket records.'
          : tickets
              .map((ticket) => `<#${ticket.channelId}> | ${ticket.status} | ${ticket.category}`)
              .join('\n');
      await interaction.reply({ embeds: [ui.info('Your tickets', description)], ephemeral: true });
      return;
    }
    const channel = currentTextTicketChannel(context);
    const canManage = Boolean(
      interaction.memberPermissions?.has(PermissionFlagsBits.ManageChannels)
    );
    if (subcommand === 'close') {
      const ticket = await service.close(
        interaction.guild,
        channel,
        interaction.user.id,
        canManage
      );
      await interaction.reply({
        embeds: [
          ui.success(
            'Ticket closed',
            `Ticket ${ticket.id} is closed. The opener can no longer send messages.`
          )
        ],
        ephemeral: true
      });
      return;
    }
    if (subcommand === 'reopen') {
      const ticket = await service.reopen(
        interaction.guild,
        channel,
        interaction.user.id,
        canManage
      );
      await interaction.reply({
        embeds: [ui.success('Ticket reopened', `Ticket ${ticket.id} is open.`)],
        ephemeral: true
      });
      return;
    }
    if (!canManage)
      throw new PermissionDeniedError('Support staff need Manage Channels to claim tickets.');
    const ticket =
      subcommand === 'claim'
        ? await service.claim(interaction.guild.id, channel.id, interaction.user.id)
        : await service.unclaim(interaction.guild.id, channel.id);
    await interaction.reply({
      embeds: [
        ui.info(
          subcommand === 'claim' ? 'Ticket claimed' : 'Ticket unclaimed',
          subcommand === 'claim'
            ? `Ticket ${ticket.id} is claimed by you.`
            : `Ticket ${ticket.id} is available for staff.`
        )
      ],
      ephemeral: true
    });
  }
});
