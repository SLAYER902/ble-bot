import {
  ChannelType,
  PermissionFlagsBits,
  type Guild,
  type GuildMember,
  type TextChannel
} from 'discord.js';

import { PermissionDeniedError, ResourceNotFoundError } from '../../errors/domain-error.js';
import { safeText } from '../../utils/text.js';
import type { TicketPanelRecord, TicketRecord, TicketRepository } from './ticket-repository.js';

const channelName = (name: string): string =>
  `ticket-${
    name
      .toLowerCase()
      .replace(/[^a-z0-9-]/gu, '-')
      .replace(/-+/gu, '-')
      .slice(0, 80) || 'member'
  }`;

export class TicketService {
  public constructor(private readonly repository: TicketRepository) {}

  public async panel(guildId: string, panelId: string): Promise<TicketPanelRecord> {
    const panel = await this.repository.panel(guildId, panelId);
    if (!panel) throw new ResourceNotFoundError('This ticket panel no longer exists.');
    return panel;
  }

  public async create(
    guild: Guild,
    opener: GuildMember,
    botUserId: string,
    subject: string,
    maxOpenPerUser = 2
  ): Promise<TicketRecord> {
    return this.createTicket(guild, opener, botUserId, {
      subject,
      details: 'Created directly with /ticket create.',
      category: 'General support',
      maxOpenPerUser
    });
  }

  public async createFromPanel(
    guild: Guild,
    panel: TicketPanelRecord,
    opener: GuildMember,
    botUserId: string,
    subject: string,
    details: string
  ): Promise<TicketRecord> {
    if (!panel.enabled)
      throw new PermissionDeniedError('This ticket panel is currently unavailable.');
    return this.createTicket(guild, opener, botUserId, {
      panel,
      subject,
      details,
      category: panel.name,
      maxOpenPerUser: panel.maxOpenPerUser
    });
  }

  public async close(
    guild: Guild,
    channel: TextChannel,
    actorId: string,
    canManage: boolean,
    reason?: string
  ): Promise<TicketRecord> {
    const ticket = await this.requireTicket(guild.id, channel.id);
    if (ticket.openerId !== actorId && !canManage)
      throw new PermissionDeniedError(
        'Only the ticket opener or authorized support staff can close this ticket.'
      );
    const result = await this.repository.close(ticket.id, actorId, reason);
    await channel.permissionOverwrites.edit(
      ticket.openerId,
      { SendMessages: false },
      { reason: 'BLE Tickets: closed' }
    );
    return result;
  }

  public async reopen(
    guild: Guild,
    channel: TextChannel,
    actorId: string,
    canManage: boolean
  ): Promise<TicketRecord> {
    const ticket = await this.requireTicket(guild.id, channel.id);
    if (ticket.openerId !== actorId && !canManage)
      throw new PermissionDeniedError(
        'Only the ticket opener or authorized support staff can reopen this ticket.'
      );
    const result = await this.repository.reopen(ticket.id, actorId);
    await channel.permissionOverwrites.edit(
      ticket.openerId,
      { SendMessages: true },
      { reason: 'BLE Tickets: reopened' }
    );
    return result;
  }

  public async claim(guild: Guild, channelId: string, actor: GuildMember): Promise<TicketRecord> {
    const ticket = await this.requireTicket(guild.id, channelId);
    await this.requireStaff(guild, ticket, actor);
    if (ticket.status !== 'OPEN')
      throw new PermissionDeniedError('Only open tickets can be claimed.');
    if (ticket.claimedBy && ticket.claimedBy !== actor.id)
      throw new PermissionDeniedError('This ticket is already claimed by another staff member.');
    return this.repository.setClaim(ticket.id, actor.id, actor.id);
  }

  public async unclaim(guild: Guild, channelId: string, actor: GuildMember): Promise<TicketRecord> {
    const ticket = await this.requireTicket(guild.id, channelId);
    await this.requireStaff(guild, ticket, actor);
    if (
      ticket.claimedBy &&
      ticket.claimedBy !== actor.id &&
      !actor.permissions.has(PermissionFlagsBits.ManageGuild)
    )
      throw new PermissionDeniedError(
        'Only the assigned staff member or a server manager can unclaim this ticket.'
      );
    return this.repository.setClaim(ticket.id, null, actor.id);
  }

  public async isStaff(guild: Guild, ticket: TicketRecord, member: GuildMember): Promise<boolean> {
    if (member.permissions.has(PermissionFlagsBits.ManageChannels)) return true;
    if (!ticket.panelId) return false;
    const panel = await this.repository.panel(guild.id, ticket.panelId);
    return Boolean(panel?.staffRoleIds.some((roleId) => member.roles.cache.has(roleId)));
  }

  public async canClose(guild: Guild, ticket: TicketRecord, member: GuildMember): Promise<boolean> {
    return ticket.openerId === member.id || this.isStaff(guild, ticket, member);
  }

  public async addParticipant(
    guild: Guild,
    channel: TextChannel,
    actor: GuildMember,
    userId: string
  ): Promise<TicketRecord> {
    const ticket = await this.requireTicket(guild.id, channel.id);
    await this.requireStaff(guild, ticket, actor);
    await channel.permissionOverwrites.edit(
      userId,
      {
        ViewChannel: true,
        SendMessages: ticket.status === 'OPEN',
        ReadMessageHistory: true
      },
      { reason: 'BLE Tickets: participant added' }
    );
    await this.repository.addParticipant(ticket.id, userId, actor.id);
    return ticket;
  }

  public async removeParticipant(
    guild: Guild,
    channel: TextChannel,
    actor: GuildMember,
    userId: string
  ): Promise<TicketRecord> {
    const ticket = await this.requireTicket(guild.id, channel.id);
    await this.requireStaff(guild, ticket, actor);
    if (ticket.openerId === userId)
      throw new PermissionDeniedError('The ticket opener cannot be removed from their own ticket.');
    await channel.permissionOverwrites.delete(userId, 'BLE Tickets: participant removed');
    await this.repository.removeParticipant(ticket.id, userId, actor.id);
    return ticket;
  }

  private async createTicket(
    guild: Guild,
    opener: GuildMember,
    botUserId: string,
    input: Readonly<{
      panel?: TicketPanelRecord;
      subject: string;
      details: string;
      category: string;
      maxOpenPerUser: number;
    }>
  ): Promise<TicketRecord> {
    await this.repository.ensureGuild(guild.id, guild.name);
    const existing = (await this.repository.listForUser(guild.id, opener.id)).filter(
      (ticket) => ticket.status === 'OPEN'
    );
    const limit = input.maxOpenPerUser;
    if (existing.length >= limit)
      throw new PermissionDeniedError(`You already have the maximum of ${limit} open tickets.`);
    const channel = await guild.channels.create({
      name: channelName(opener.user.username),
      type: ChannelType.GuildText,
      ...(input.panel?.categoryId ? { parent: input.panel.categoryId } : {}),
      topic: `BLE Ticket subject: ${safeText(input.subject, 120)}`,
      permissionOverwrites: [
        { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
        {
          id: opener.id,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.ReadMessageHistory
          ]
        },
        {
          id: botUserId,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.ReadMessageHistory,
            PermissionFlagsBits.ManageChannels
          ]
        },
        ...(input.panel?.staffRoleIds.map((roleId) => ({
          id: roleId,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.ReadMessageHistory
          ]
        })) ?? [])
      ],
      reason: 'BLE Tickets: new ticket'
    });
    try {
      return await this.repository.create({
        guildId: guild.id,
        channelId: channel.id,
        openerId: opener.id,
        ...(input.panel ? { panelId: input.panel.id } : {}),
        subject: safeText(input.subject, 120),
        details: safeText(input.details, 1_000),
        category: input.category
      });
    } catch (error) {
      await channel
        .delete('BLE Tickets: persistence failed; removing orphan channel')
        .catch(() => undefined);
      throw error;
    }
  }

  private async requireStaff(
    guild: Guild,
    ticket: TicketRecord,
    actor: GuildMember
  ): Promise<void> {
    if (!(await this.isStaff(guild, ticket, actor)))
      throw new PermissionDeniedError('Only authorized ticket staff can perform this action.');
  }

  private async requireTicket(guildId: string, channelId: string): Promise<TicketRecord> {
    const ticket = await this.repository.byChannel(guildId, channelId);
    if (!ticket) throw new ResourceNotFoundError('This channel is not a BLE ticket.');
    return ticket;
  }
}
