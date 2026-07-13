import { PermissionFlagsBits, SlashCommandBuilder, TextChannel } from 'discord.js';

import { PermissionDeniedError, ResourceNotFoundError } from '../../errors/domain-error.js';
import type { PremiumService } from '../../features/premium/premium-service.js';
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

const requireManager = (context: CommandContext): void => {
  if (!context.interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild))
    throw new PermissionDeniedError('Manage Server is required to configure ticket panels.');
};

const requireTextChannel = (channel: unknown): TextChannel => {
  if (!(channel instanceof TextChannel))
    throw new ResourceNotFoundError('The selected channel is no longer a standard text channel.');
  return channel;
};

export const createTicketCommand = (
  service: TicketService,
  repository: TicketRepository,
  premium: PremiumService,
  ui: Ui
): Command => ({
  metadata: {
    name: 'ticket',
    category: 'management',
    summary: 'Create and manage private BLE support tickets.',
    longDescription:
      'Provides persistent ticket panels, private modal intake, control panels, staff claims, safe closure, and recorded ticket events.',
    examples: ['/ticket setup', '/ticket panel create name:BLE Support description:Ask for help'],
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
      subcommand.setName('setup').setDescription('Open the ticket setup centre.')
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('create')
        .setDescription('Open a private support ticket directly.')
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
      subcommand.setName('list').setDescription('List your recent ticket channels.')
    )
    .addSubcommand((subcommand) =>
      subcommand.setName('info').setDescription('View the current ticket timeline.')
    )
    .addSubcommand((subcommand) =>
      subcommand.setName('settings').setDescription('View ticket panel usage and configuration.')
    )
    .addSubcommandGroup((group) =>
      group
        .setName('panel')
        .setDescription('Create and publish persistent ticket panels.')
        .addSubcommand((subcommand) =>
          subcommand
            .setName('create')
            .setDescription('Create a ticket panel configuration.')
            .addStringOption((option) =>
              option
                .setName('name')
                .setDescription('Member-facing panel name.')
                .setRequired(true)
                .setMaxLength(80)
            )
            .addStringOption((option) =>
              option
                .setName('description')
                .setDescription('Member-facing panel description.')
                .setRequired(true)
                .setMaxLength(500)
            )
        )
        .addSubcommand((subcommand) =>
          subcommand
            .setName('edit')
            .setDescription('Open channel and staff-role selectors for a panel.')
            .addStringOption((option) =>
              option
                .setName('id')
                .setDescription('Panel ID.')
                .setRequired(true)
                .setMinLength(36)
                .setMaxLength(36)
            )
        )
        .addSubcommand((subcommand) =>
          subcommand
            .setName('send')
            .setDescription('Publish a configured ticket panel.')
            .addStringOption((option) =>
              option
                .setName('id')
                .setDescription('Panel ID.')
                .setRequired(true)
                .setMinLength(36)
                .setMaxLength(36)
            )
        )
        .addSubcommand((subcommand) =>
          subcommand.setName('list').setDescription('List ticket panels.')
        )
        .addSubcommand((subcommand) =>
          subcommand
            .setName('delete')
            .setDescription('Delete an unpublished or retired panel configuration.')
            .addStringOption((option) =>
              option
                .setName('id')
                .setDescription('Panel ID.')
                .setRequired(true)
                .setMinLength(36)
                .setMaxLength(36)
            )
        )
    ),
  async execute(context: CommandContext): Promise<void> {
    const { interaction } = context;
    if (!interaction.guild || !interaction.client.user)
      throw new PermissionDeniedError(
        'This command can only be used in a server after BLE Bot is ready.'
      );
    const group = interaction.options.getSubcommandGroup(false);
    const subcommand = interaction.options.getSubcommand();
    if (group === 'panel') {
      await handlePanelCommand(context, service, repository, premium, ui, subcommand);
      return;
    }
    if (subcommand === 'setup') {
      requireManager(context);
      await repository.ensureGuild(interaction.guild.id, interaction.guild.name);
      const [status, panelCount] = await Promise.all([
        premium.status(interaction.guild.id),
        repository.countPanels(interaction.guild.id)
      ]);
      await interaction.reply({
        ...ui.ticketSetupCentre({
          panelCount,
          panelLimit: status.limits.ticketPanels,
          plan: status.plan
        }),
        ephemeral: true
      });
      return;
    }
    if (subcommand === 'create') {
      await interaction.deferReply({ ephemeral: true });
      const member = await interaction.guild.members.fetch(interaction.user.id);
      const status = await premium.status(interaction.guild.id);
      const ticket = await service.create(
        interaction.guild,
        member,
        interaction.client.user.id,
        interaction.options.getString('subject', true),
        status.limits.openTicketsPerUser
      );
      const channel = requireTextChannel(await interaction.guild.channels.fetch(ticket.channelId));
      const message = await channel.send(ui.ticketControlPanel(ticket));
      await repository.updateControlMessage(ticket.id, message.id);
      await interaction.editReply({
        embeds: [ui.success('Ticket created', `Your private ticket is <#${ticket.channelId}>.`)]
      });
      return;
    }
    if (subcommand === 'list') {
      const tickets = await repository.listForUser(interaction.guild.id, interaction.user.id);
      const description = tickets.length
        ? tickets
            .map((ticket) => `<#${ticket.channelId}> | ${ticket.status} | ${ticket.category}`)
            .join('\n')
        : 'You have no ticket records.';
      await interaction.reply({ embeds: [ui.info('Your tickets', description)], ephemeral: true });
      return;
    }
    if (subcommand === 'settings') {
      requireManager(context);
      const [status, panels] = await Promise.all([
        premium.status(interaction.guild.id),
        repository.listPanels(interaction.guild.id)
      ]);
      await interaction.reply({
        embeds: [
          ui.page('info', {
            title: ui.labeled('Ticket settings', 'settings'),
            description: `Plan: ${status.plan}\nPanels: ${panels.length} of ${status.limits.ticketPanels}`,
            fields: panels.length
              ? panels.map((panel) => ({
                  name: panel.name,
                  value: `ID: ${panel.id}\nChannel: ${panel.targetChannelId ? `<#${panel.targetChannelId}>` : 'Not selected'}\nStatus: ${panel.enabled ? 'Enabled' : 'Disabled'}`
                }))
              : [
                  {
                    name: 'No panels',
                    value: 'Run `/ticket setup` to create the first persistent ticket panel.'
                  }
                ]
          })
        ],
        ephemeral: true
      });
      return;
    }
    const channel = currentTextTicketChannel(context);
    const actor = await interaction.guild.members.fetch(interaction.user.id);
    const ticket = await repository.byChannel(interaction.guild.id, channel.id);
    if (!ticket) throw new ResourceNotFoundError('This channel is not a BLE ticket.');
    const canManage = await service.isStaff(interaction.guild, ticket, actor);
    if (subcommand === 'close') {
      const result = await service.close(interaction.guild, channel, actor.id, canManage);
      await updateTicketControl(interaction.guild, result, ui);
      await interaction.reply({
        embeds: [
          ui.success(
            'Ticket closed',
            `Ticket ${result.id} is closed. The requester can no longer send messages.`
          )
        ],
        ephemeral: true
      });
      return;
    }
    if (subcommand === 'reopen') {
      const result = await service.reopen(interaction.guild, channel, actor.id, canManage);
      await updateTicketControl(interaction.guild, result, ui);
      await interaction.reply({
        embeds: [ui.success('Ticket reopened', `Ticket ${result.id} is open.`)],
        ephemeral: true
      });
      return;
    }
    if (subcommand === 'claim' || subcommand === 'unclaim') {
      const result =
        subcommand === 'claim'
          ? await service.claim(interaction.guild, channel.id, actor)
          : await service.unclaim(interaction.guild, channel.id, actor);
      await updateTicketControl(interaction.guild, result, ui);
      await interaction.reply({
        embeds: [
          ui.info(
            subcommand === 'claim' ? 'Ticket claimed' : 'Ticket unclaimed',
            subcommand === 'claim'
              ? `Ticket ${result.id} is claimed by you.`
              : `Ticket ${result.id} is available for staff.`
          )
        ],
        ephemeral: true
      });
      return;
    }
    const timeline = await repository.timeline(ticket.id);
    await interaction.reply({
      embeds: [
        ui.page('info', {
          title: ui.labeled('Ticket timeline', 'ticket'),
          description: timeline.length
            ? timeline
                .map(
                  (event) =>
                    `<t:${Math.floor(event.createdAt.getTime() / 1_000)}:R> — ${event.kind.replaceAll('_', ' ')}${event.actorId ? ` by <@${event.actorId}>` : ''}`
                )
                .join('\n')
            : 'No timeline events were recorded.'
        })
      ],
      ephemeral: true
    });
  }
});

const updateTicketControl = async (
  guild: NonNullable<CommandContext['interaction']['guild']>,
  ticket: Awaited<ReturnType<TicketService['close']>>,
  ui: Ui
): Promise<void> => {
  if (!ticket.controlMessageId) return;
  const channel = await guild.channels.fetch(ticket.channelId).catch(() => undefined);
  if (!(channel instanceof TextChannel)) return;
  const message = await channel.messages.fetch(ticket.controlMessageId).catch(() => undefined);
  if (message) await message.edit(ui.ticketControlPanel(ticket));
};

const handlePanelCommand = async (
  context: CommandContext,
  service: TicketService,
  repository: TicketRepository,
  premium: PremiumService,
  ui: Ui,
  subcommand: string
): Promise<void> => {
  const { interaction } = context;
  if (!interaction.guild) return;
  requireManager(context);
  await repository.ensureGuild(interaction.guild.id, interaction.guild.name);
  if (subcommand === 'create') {
    const [status, panelCount] = await Promise.all([
      premium.status(interaction.guild.id),
      repository.countPanels(interaction.guild.id)
    ]);
    if (panelCount >= status.limits.ticketPanels) {
      await interaction.reply({
        embeds: [
          ui.premiumNotice({
            title: 'Free ticket panel limit reached',
            currentUsage: `You currently use ${panelCount} of ${status.limits.ticketPanels} ticket panels.`,
            freeAlternative:
              'Edit an existing panel or delete an unused panel. Premium enables additional panels.'
          })
        ],
        ephemeral: true
      });
      return;
    }
    const panel = await repository.createPanel({
      guildId: interaction.guild.id,
      name: interaction.options.getString('name', true),
      description: interaction.options.getString('description', true),
      createdBy: interaction.user.id,
      maxOpenPerUser: status.limits.openTicketsPerUser
    });
    await interaction.reply({ ...ui.ticketPanelEditor(panel), ephemeral: true });
    return;
  }
  if (subcommand === 'list') {
    const panels = await repository.listPanels(interaction.guild.id);
    await interaction.reply({
      embeds: [
        ui.page('info', {
          title: ui.labeled('Ticket panels', 'ticket'),
          description: panels.length
            ? panels
                .map(
                  (panel) =>
                    `${panel.name}\nID: ${panel.id}\nChannel: ${panel.targetChannelId ? `<#${panel.targetChannelId}>` : 'Not selected'}`
                )
                .join('\n\n')
            : 'No ticket panels are configured.'
        })
      ],
      ephemeral: true
    });
    return;
  }
  const panelId = interaction.options.getString('id', true);
  const panel = await service.panel(interaction.guild.id, panelId);
  if (subcommand === 'edit') {
    await interaction.reply({ ...ui.ticketPanelEditor(panel), ephemeral: true });
    return;
  }
  if (subcommand === 'send') {
    if (!panel.targetChannelId)
      throw new ResourceNotFoundError(
        'Open `/ticket panel edit` and select a panel channel before publishing.'
      );
    const channel = requireTextChannel(
      await interaction.guild.channels.fetch(panel.targetChannelId)
    );
    const existing = panel.messageId
      ? await channel.messages.fetch(panel.messageId).catch(() => undefined)
      : undefined;
    const message = existing
      ? await existing.edit(ui.ticketPanel(panel))
      : await channel.send(ui.ticketPanel(panel));
    if (!panel.messageId)
      await repository.updatePanel(interaction.guild.id, panel.id, { messageId: message.id });
    await interaction.reply({
      embeds: [
        ui.success(
          existing ? 'Ticket panel updated' : 'Ticket panel published',
          `Members can use the panel in <#${channel.id}>.`
        )
      ],
      ephemeral: true
    });
    return;
  }
  if (panel.messageId && panel.targetChannelId) {
    const channel = await interaction.guild.channels
      .fetch(panel.targetChannelId)
      .catch(() => undefined);
    if (channel instanceof TextChannel)
      await channel.messages.delete(panel.messageId).catch(() => undefined);
  }
  await repository.deletePanel(interaction.guild.id, panel.id);
  await interaction.reply({
    embeds: [
      ui.success(
        'Ticket panel deleted',
        'The panel configuration and published panel message were removed.'
      )
    ],
    ephemeral: true
  });
};
