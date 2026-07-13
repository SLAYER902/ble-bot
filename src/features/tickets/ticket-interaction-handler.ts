import {
  AttachmentBuilder,
  PermissionFlagsBits,
  TextChannel,
  type ButtonInteraction,
  type ChannelSelectMenuInteraction,
  type Guild,
  type GuildMember,
  type Interaction,
  type ModalSubmitInteraction,
  type RoleSelectMenuInteraction
} from 'discord.js';

import type { ComponentHandler } from '../../commands/framework/component-handler.js';
import { PermissionDeniedError, ResourceNotFoundError } from '../../errors/domain-error.js';
import type { PremiumService } from '../premium/premium-service.js';
import type { TicketRecord } from './ticket-repository.js';
import type { TicketRepository } from './ticket-repository.js';
import type { TicketService } from './ticket-service.js';
import type { Ui } from '../../ui/ui.js';

const ticketPrefix = 'ble:ticket:';

const isTicketInteraction = (interaction: Interaction): boolean =>
  (interaction.isButton() ||
    interaction.isChannelSelectMenu() ||
    interaction.isRoleSelectMenu() ||
    interaction.isModalSubmit()) &&
  interaction.customId.startsWith(ticketPrefix);

const requireGuild = (
  interaction:
    | ButtonInteraction
    | ChannelSelectMenuInteraction
    | RoleSelectMenuInteraction
    | ModalSubmitInteraction
): Guild => {
  if (!interaction.inGuild() || !interaction.guild)
    throw new PermissionDeniedError('This ticket interaction can only be used in a server.');
  return interaction.guild;
};

const requireTextChannel = (channel: unknown): TextChannel => {
  if (!(channel instanceof TextChannel))
    throw new ResourceNotFoundError('The original ticket channel is no longer available.');
  return channel;
};

const requireManager = (member: GuildMember): void => {
  if (!member.permissions.has(PermissionFlagsBits.ManageGuild))
    throw new PermissionDeniedError('Manage Server is required to configure ticket panels.');
};

export class TicketInteractionHandler implements ComponentHandler {
  public constructor(
    private readonly service: TicketService,
    private readonly repository: TicketRepository,
    private readonly premium: PremiumService,
    private readonly ui: Ui
  ) {}

  public canHandle(interaction: Interaction): boolean {
    return isTicketInteraction(interaction);
  }

  public async handle(interaction: Interaction): Promise<void> {
    if (interaction.isModalSubmit()) return this.handleModal(interaction);
    if (interaction.isChannelSelectMenu()) return this.handleChannelSelect(interaction);
    if (interaction.isRoleSelectMenu()) return this.handleRoleSelect(interaction);
    if (interaction.isButton()) return this.handleButton(interaction);
  }

  private async handleModal(interaction: ModalSubmitInteraction): Promise<void> {
    const [, , action, panelId] = interaction.customId.split(':');
    if (action === 'panel-create') {
      await this.createPanelFromModal(interaction);
      return;
    }
    if (action !== 'submit' || !panelId)
      throw new ResourceNotFoundError('This ticket form is no longer valid.');
    const guild = requireGuild(interaction);
    const panel = await this.service.panel(guild.id, panelId);
    const member = await guild.members.fetch(interaction.user.id);
    await interaction.deferReply({ ephemeral: true });
    const ticket = await this.service.createFromPanel(
      guild,
      panel,
      member,
      interaction.client.user.id,
      interaction.fields.getTextInputValue('subject'),
      interaction.fields.getTextInputValue('details')
    );
    const channel = requireTextChannel(await guild.channels.fetch(ticket.channelId));
    const message = await channel.send(this.ui.ticketControlPanel(ticket));
    await this.repository.updateControlMessage(ticket.id, message.id);
    await interaction.editReply({
      embeds: [
        this.ui.success(
          'Ticket created',
          `Your private support ticket is ready: <#${ticket.channelId}>.`
        )
      ]
    });
  }

  private async handleChannelSelect(interaction: ChannelSelectMenuInteraction): Promise<void> {
    const [, , action, panelId] = interaction.customId.split(':');
    if (!panelId || (action !== 'panel-target' && action !== 'panel-category'))
      throw new ResourceNotFoundError('This ticket panel editor is no longer valid.');
    const guild = requireGuild(interaction);
    const member = await guild.members.fetch(interaction.user.id);
    requireManager(member);
    const selected = interaction.values[0];
    if (!selected) throw new ResourceNotFoundError('No channel was selected.');
    const panel = await this.repository.updatePanel(guild.id, panelId, {
      ...(action === 'panel-target' ? { targetChannelId: selected } : { categoryId: selected })
    });
    await interaction.update(this.ui.ticketPanelEditor(panel));
  }

  private async handleRoleSelect(interaction: RoleSelectMenuInteraction): Promise<void> {
    const [, , action, panelId] = interaction.customId.split(':');
    if (action !== 'panel-staff' || !panelId)
      throw new ResourceNotFoundError('This ticket panel editor is no longer valid.');
    const guild = requireGuild(interaction);
    const member = await guild.members.fetch(interaction.user.id);
    requireManager(member);
    const panel = await this.repository.updatePanel(guild.id, panelId, {
      staffRoleIds: interaction.values
    });
    await interaction.update(this.ui.ticketPanelEditor(panel));
  }

  private async handleButton(interaction: ButtonInteraction): Promise<void> {
    const [, , action, ticketOrPanelId, resolution] = interaction.customId.split(':');
    if (!action || !ticketOrPanelId)
      throw new ResourceNotFoundError('This BLE control has expired.');
    const guild = requireGuild(interaction);
    if (action === 'setup-create') {
      const member = await guild.members.fetch(interaction.user.id);
      requireManager(member);
      await interaction.showModal(this.ui.ticketPanelCreateModal());
      return;
    }
    if (action === 'open') {
      const panel = await this.service.panel(guild.id, ticketOrPanelId);
      if (!panel.enabled)
        throw new PermissionDeniedError('This ticket panel is currently unavailable.');
      await interaction.showModal(this.ui.ticketIntakeModal(panel));
      return;
    }
    if (action === 'panel-publish') {
      await this.publishPanel(interaction, guild, ticketOrPanelId);
      return;
    }
    const ticket = await this.requireTicketInChannel(guild, ticketOrPanelId, interaction.channel);
    const member = await guild.members.fetch(interaction.user.id);
    if (action === 'claim') {
      const result = await this.service.claim(guild, ticket.channelId, member);
      await interaction.update(this.ui.ticketControlPanel(result));
      return;
    }
    if (action === 'unclaim') {
      const result = await this.service.unclaim(guild, ticket.channelId, member);
      await interaction.update(this.ui.ticketControlPanel(result));
      return;
    }
    if (action === 'close' && resolution === 'confirm') {
      await this.closeTicket(interaction, guild, ticket, member);
      return;
    }
    if (action === 'close' && resolution === 'cancel') {
      await interaction.update({
        embeds: [this.ui.info('Ticket close cancelled', 'The ticket remains open.')],
        components: []
      });
      return;
    }
    if (action === 'close') {
      if (!(await this.service.canClose(guild, ticket, member)))
        throw new PermissionDeniedError(
          'Only the ticket opener or authorized support staff can close this ticket.'
        );
      await interaction.reply({
        embeds: [
          this.ui.warning(
            'Confirm ticket closure',
            'Closing prevents the requester from sending more messages. This action can be reversed by the opener or support staff.'
          )
        ],
        components: [
          this.ui.confirmation(`ble:ticket:close:${ticket.id}`, 'Close ticket', 'Keep open')
        ],
        ephemeral: true
      });
      return;
    }
    if (action === 'reopen') {
      if (!(await this.service.canClose(guild, ticket, member)))
        throw new PermissionDeniedError(
          'Only the ticket opener or authorized support staff can reopen this ticket.'
        );
      const channel = requireTextChannel(interaction.channel);
      const result = await this.service.reopen(guild, channel, member.id, true);
      await interaction.update(this.ui.ticketControlPanel(result));
      return;
    }
    if (action === 'info') {
      const timeline = await this.repository.timeline(ticket.id);
      const details = timeline.length
        ? timeline
            .map(
              (event) =>
                `<t:${Math.floor(event.createdAt.getTime() / 1_000)}:R> — ${event.kind.replaceAll('_', ' ')}${event.actorId ? ` by <@${event.actorId}>` : ''}`
            )
            .join('\n')
        : 'No timeline entries were recorded.';
      await interaction.reply({
        embeds: [
          this.ui.page('info', {
            title: this.ui.labeled('Ticket timeline', 'ticket'),
            description: details
          })
        ],
        ephemeral: true
      });
      return;
    }
    if (action === 'transcript') {
      if (!(await this.service.canClose(guild, ticket, member)))
        throw new PermissionDeniedError(
          'Only the ticket opener or authorized support staff can export a ticket transcript.'
        );
      await this.sendTranscript(interaction, ticket, member.id);
      return;
    }
    if (action === 'delete' && resolution === 'confirm') {
      if (!(await this.service.isStaff(guild, ticket, member)))
        throw new PermissionDeniedError(
          'Only authorized support staff can permanently delete a ticket.'
        );
      await interaction.deferUpdate();
      const channel = requireTextChannel(interaction.channel);
      await channel.delete('BLE Tickets: permanent deletion confirmed');
      await this.repository.deleteTicket(ticket.id, member.id);
      return;
    }
    if (action === 'delete' && resolution === 'cancel') {
      await interaction.update({
        embeds: [
          this.ui.info('Ticket deletion cancelled', 'The closed ticket has been preserved.')
        ],
        components: []
      });
      return;
    }
    if (action === 'delete') {
      if (!(await this.service.isStaff(guild, ticket, member)))
        throw new PermissionDeniedError(
          'Only authorized support staff can permanently delete a ticket.'
        );
      await interaction.reply({
        embeds: [
          this.ui.warning(
            'Confirm permanent deletion',
            'This removes the ticket channel and its BLE ticket record. Generate a transcript first if the conversation must be retained.'
          )
        ],
        components: [
          this.ui.confirmation(
            `ble:ticket:delete:${ticket.id}`,
            'Delete permanently',
            'Keep ticket'
          )
        ],
        ephemeral: true
      });
      return;
    }
    throw new ResourceNotFoundError('This ticket control is not recognized.');
  }

  private async publishPanel(
    interaction: ButtonInteraction,
    guild: Guild,
    panelId: string
  ): Promise<void> {
    const member = await guild.members.fetch(interaction.user.id);
    requireManager(member);
    const panel = await this.service.panel(guild.id, panelId);
    if (!panel.targetChannelId)
      throw new ResourceNotFoundError(
        'Select a panel channel before publishing this ticket panel.'
      );
    const channel = requireTextChannel(await guild.channels.fetch(panel.targetChannelId));
    const existing = panel.messageId
      ? await channel.messages.fetch(panel.messageId).catch(() => undefined)
      : undefined;
    const message = existing
      ? await existing.edit(this.ui.ticketPanel(panel))
      : await channel.send(this.ui.ticketPanel(panel));
    if (!panel.messageId)
      await this.repository.updatePanel(guild.id, panel.id, { messageId: message.id });
    await interaction.reply({
      embeds: [
        this.ui.success(
          existing ? 'Ticket panel updated' : 'Ticket panel published',
          `Members can use the panel in <#${channel.id}>.`
        )
      ],
      ephemeral: true
    });
  }

  private async closeTicket(
    interaction: ButtonInteraction,
    guild: Guild,
    ticket: TicketRecord,
    member: GuildMember
  ): Promise<void> {
    if (!(await this.service.canClose(guild, ticket, member)))
      throw new PermissionDeniedError(
        'Only the ticket opener or authorized support staff can close this ticket.'
      );
    const channel = requireTextChannel(interaction.channel);
    const result = await this.service.close(guild, channel, member.id, true);
    const controlChannel = requireTextChannel(await guild.channels.fetch(result.channelId));
    if (result.controlMessageId) {
      const message = await controlChannel.messages
        .fetch(result.controlMessageId)
        .catch(() => undefined);
      if (message) await message.edit(this.ui.ticketControlPanel(result));
    }
    await interaction.update({
      embeds: [
        this.ui.success(
          'Ticket closed',
          'The ticket has been closed and the control panel was updated.'
        )
      ],
      components: []
    });
  }

  private async createPanelFromModal(interaction: ModalSubmitInteraction): Promise<void> {
    const guild = requireGuild(interaction);
    const member = await guild.members.fetch(interaction.user.id);
    requireManager(member);
    await this.repository.ensureGuild(guild.id, guild.name);
    const [status, panelCount] = await Promise.all([
      this.premium.status(guild.id),
      this.repository.countPanels(guild.id)
    ]);
    if (panelCount >= status.limits.ticketPanels)
      throw new PermissionDeniedError(
        `Free limit reached: this server uses ${panelCount} of ${status.limits.ticketPanels} ticket panels. Edit or delete an existing panel, or use a Premium entitlement for additional panels.`
      );
    const panel = await this.repository.createPanel({
      guildId: guild.id,
      name: interaction.fields.getTextInputValue('name').trim(),
      description: interaction.fields.getTextInputValue('description').trim(),
      createdBy: member.id,
      maxOpenPerUser: status.limits.openTicketsPerUser
    });
    await interaction.reply({ ...this.ui.ticketPanelEditor(panel), ephemeral: true });
  }

  private async sendTranscript(
    interaction: ButtonInteraction,
    ticket: TicketRecord,
    actorId: string
  ): Promise<void> {
    const channel = requireTextChannel(interaction.channel);
    const messages = await channel.messages.fetch({ limit: 100 });
    const body = [...messages.values()]
      .reverse()
      .map((message) => {
        const attachments = message.attachments.map((attachment) => attachment.url).join(' ');
        const content = message.content || '[Content unavailable to BLE Bot]';
        return `[${message.createdAt.toISOString()}] ${message.author.tag}: ${content}${attachments ? `\nAttachments: ${attachments}` : ''}`;
      })
      .join('\n\n');
    const transcript = [
      `BLE Ticket Transcript`,
      `Ticket: ${ticket.id}`,
      `Created by: ${ticket.openerId}`,
      `Subject: ${ticket.subject}`,
      `Status: ${ticket.status}`,
      '',
      body || 'No messages were available to include.'
    ].join('\n');
    await this.repository.recordEvent(ticket.id, 'ticket_transcript_generated', actorId, {
      messageCount: messages.size
    });
    await interaction.reply({
      embeds: [
        this.ui.success(
          'Transcript generated',
          'A text transcript of the available ticket messages is attached.'
        )
      ],
      files: [
        new AttachmentBuilder(Buffer.from(transcript, 'utf8'), {
          name: `ble-ticket-${ticket.id}.txt`
        })
      ],
      ephemeral: true
    });
  }

  private async requireTicketInChannel(
    guild: Guild,
    ticketId: string,
    channel: unknown
  ): Promise<TicketRecord> {
    const ticket = await this.repository.byId(guild.id, ticketId);
    if (!ticket) throw new ResourceNotFoundError('This ticket no longer exists.');
    const textChannel = requireTextChannel(channel);
    if (textChannel.id !== ticket.channelId)
      throw new PermissionDeniedError(
        'This ticket control can only be used in its original ticket channel.'
      );
    return ticket;
  }
}
