import {
  ChannelType,
  PermissionFlagsBits,
  type Guild,
  type GuildMember,
  type TextChannel
} from 'discord.js';

import { PermissionDeniedError, ResourceNotFoundError } from '../../errors/domain-error.js';
import { safeText } from '../../utils/text.js';
import type { TicketRecord, TicketRepository } from './ticket-repository.js';

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

  public async create(
    guild: Guild,
    opener: GuildMember,
    botUserId: string,
    subject: string
  ): Promise<TicketRecord> {
    await this.repository.ensureGuild(guild.id, guild.name);
    const existing = (await this.repository.listForUser(guild.id, opener.id)).filter(
      (ticket) => ticket.status === 'OPEN'
    );
    if (existing.length >= 3)
      throw new PermissionDeniedError('You already have the maximum number of open tickets.');
    const channel = await guild.channels.create({
      name: channelName(opener.user.username),
      type: ChannelType.GuildText,
      topic: `BLE Ticket subject: ${safeText(subject, 120)}`,
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
        }
      ],
      reason: 'BLE Tickets: new ticket'
    });
    try {
      const ticket = await this.repository.create({
        guildId: guild.id,
        channelId: channel.id,
        openerId: opener.id,
        category: 'general'
      });
      await channel.send({
        content: `Ticket created for <@${opener.id}>. Subject: ${safeText(subject, 120)}`,
        allowedMentions: { users: [opener.id], roles: [], repliedUser: false }
      });
      return ticket;
    } catch (error) {
      await channel
        .delete('BLE Tickets: persistence failed; removing orphan channel')
        .catch(() => undefined);
      throw error;
    }
  }

  public async close(
    guild: Guild,
    channel: TextChannel,
    actorId: string,
    canManage: boolean
  ): Promise<TicketRecord> {
    const ticket = await this.requireTicket(guild.id, channel.id);
    if (ticket.openerId !== actorId && !canManage)
      throw new PermissionDeniedError(
        'Only the ticket opener or support staff can close this ticket.'
      );
    const result = await this.repository.setStatus(ticket.id, 'CLOSED');
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
        'Only the ticket opener or support staff can reopen this ticket.'
      );
    const result = await this.repository.setStatus(ticket.id, 'OPEN');
    await channel.permissionOverwrites.edit(
      ticket.openerId,
      { SendMessages: true },
      { reason: 'BLE Tickets: reopened' }
    );
    return result;
  }

  public async claim(guildId: string, channelId: string, actorId: string): Promise<TicketRecord> {
    const ticket = await this.requireTicket(guildId, channelId);
    if (ticket.status !== 'OPEN')
      throw new PermissionDeniedError('Only open tickets can be claimed.');
    if (ticket.claimedBy && ticket.claimedBy !== actorId)
      throw new PermissionDeniedError('This ticket is already claimed by another staff member.');
    return this.repository.setClaim(ticket.id, actorId);
  }

  public async unclaim(guildId: string, channelId: string): Promise<TicketRecord> {
    const ticket = await this.requireTicket(guildId, channelId);
    return this.repository.setClaim(ticket.id, null);
  }

  private async requireTicket(guildId: string, channelId: string): Promise<TicketRecord> {
    const ticket = await this.repository.byChannel(guildId, channelId);
    if (!ticket) throw new ResourceNotFoundError('This channel is not a BLE ticket.');
    return ticket;
  }
}
