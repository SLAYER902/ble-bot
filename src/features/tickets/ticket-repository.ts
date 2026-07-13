import { and, count, desc, eq } from 'drizzle-orm';

import { ResourceNotFoundError } from '../../errors/domain-error.js';
import type { Database } from '../../infrastructure/database/database.js';
import {
  guilds,
  ticketPanels,
  ticketParticipants,
  ticketTimelineEvents,
  tickets
} from '../../infrastructure/database/schema.js';

export type TicketPanelRecord = Readonly<{
  id: string;
  guildId: string;
  name: string;
  description: string;
  targetChannelId?: string;
  categoryId?: string;
  messageId?: string;
  staffRoleIds: readonly string[];
  maxOpenPerUser: number;
  enabled: boolean;
  createdBy: string;
  createdAt: Date;
}>;

export type TicketRecord = Readonly<{
  id: string;
  guildId: string;
  channelId: string;
  openerId: string;
  panelId?: string;
  subject: string;
  details: string;
  controlMessageId?: string;
  claimedBy?: string;
  status: string;
  priority: string;
  category: string;
  createdAt: Date;
  closedAt?: Date;
  closedBy?: string;
  closedReason?: string;
}>;

export type TicketTimelineEvent = Readonly<{
  id: string;
  actorId?: string;
  kind: string;
  details: Record<string, unknown>;
  createdAt: Date;
}>;

const stringList = (value: unknown): readonly string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];

const detailsObject = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

const mapPanel = (panel: typeof ticketPanels.$inferSelect): TicketPanelRecord => ({
  id: panel.id,
  guildId: panel.guildId,
  name: panel.name,
  description: panel.description,
  ...(panel.targetChannelId ? { targetChannelId: panel.targetChannelId } : {}),
  ...(panel.categoryId ? { categoryId: panel.categoryId } : {}),
  ...(panel.messageId ? { messageId: panel.messageId } : {}),
  staffRoleIds: stringList(panel.staffRoleIds),
  maxOpenPerUser: panel.maxOpenPerUser,
  enabled: panel.enabled,
  createdBy: panel.createdBy,
  createdAt: panel.createdAt
});

const mapTicket = (ticket: typeof tickets.$inferSelect): TicketRecord => ({
  id: ticket.id,
  guildId: ticket.guildId,
  channelId: ticket.channelId,
  openerId: ticket.openerId,
  ...(ticket.panelId ? { panelId: ticket.panelId } : {}),
  subject: ticket.subject,
  details: ticket.details,
  ...(ticket.controlMessageId ? { controlMessageId: ticket.controlMessageId } : {}),
  ...(ticket.claimedBy ? { claimedBy: ticket.claimedBy } : {}),
  status: ticket.status,
  priority: ticket.priority,
  category: ticket.category,
  createdAt: ticket.createdAt,
  ...(ticket.closedAt ? { closedAt: ticket.closedAt } : {}),
  ...(ticket.closedBy ? { closedBy: ticket.closedBy } : {}),
  ...(ticket.closedReason ? { closedReason: ticket.closedReason } : {})
});

export class TicketRepository {
  public constructor(private readonly database: Database) {}

  public async ensureGuild(guildId: string, name: string): Promise<void> {
    await this.database.db
      .insert(guilds)
      .values({ id: guildId, name })
      .onConflictDoUpdate({ target: guilds.id, set: { name, updatedAt: new Date() } });
  }

  public async countPanels(guildId: string): Promise<number> {
    const [result] = await this.database.db
      .select({ value: count() })
      .from(ticketPanels)
      .where(eq(ticketPanels.guildId, guildId));
    return result?.value ?? 0;
  }

  public async createPanel(
    input: Readonly<{
      guildId: string;
      name: string;
      description: string;
      createdBy: string;
      maxOpenPerUser: number;
    }>
  ): Promise<TicketPanelRecord> {
    const [panel] = await this.database.db
      .insert(ticketPanels)
      .values({
        guildId: input.guildId,
        name: input.name,
        description: input.description,
        createdBy: input.createdBy,
        maxOpenPerUser: input.maxOpenPerUser
      })
      .returning();
    if (!panel) throw new Error('Unable to persist the ticket panel.');
    return mapPanel(panel);
  }

  public async panel(guildId: string, panelId: string): Promise<TicketPanelRecord | undefined> {
    const panel = await this.database.db.query.ticketPanels.findFirst({
      where: and(eq(ticketPanels.guildId, guildId), eq(ticketPanels.id, panelId))
    });
    return panel ? mapPanel(panel) : undefined;
  }

  public async listPanels(guildId: string): Promise<readonly TicketPanelRecord[]> {
    const records = await this.database.db.query.ticketPanels.findMany({
      where: eq(ticketPanels.guildId, guildId),
      orderBy: [desc(ticketPanels.createdAt)]
    });
    return records.map(mapPanel);
  }

  public async updatePanel(
    guildId: string,
    panelId: string,
    patch: Readonly<{
      name?: string;
      description?: string;
      targetChannelId?: string | null;
      categoryId?: string | null;
      staffRoleIds?: readonly string[];
      messageId?: string | null;
      enabled?: boolean;
    }>
  ): Promise<TicketPanelRecord> {
    const [panel] = await this.database.db
      .update(ticketPanels)
      .set({
        ...patch,
        ...(patch.staffRoleIds ? { staffRoleIds: [...patch.staffRoleIds] } : {}),
        updatedAt: new Date()
      })
      .where(and(eq(ticketPanels.guildId, guildId), eq(ticketPanels.id, panelId)))
      .returning();
    if (!panel) throw new ResourceNotFoundError('This ticket panel no longer exists.');
    return mapPanel(panel);
  }

  public async deletePanel(guildId: string, panelId: string): Promise<void> {
    const result = await this.database.db
      .delete(ticketPanels)
      .where(and(eq(ticketPanels.guildId, guildId), eq(ticketPanels.id, panelId)))
      .returning({ id: ticketPanels.id });
    if (result.length === 0) throw new ResourceNotFoundError('This ticket panel no longer exists.');
  }

  public async create(
    input: Readonly<{
      guildId: string;
      channelId: string;
      openerId: string;
      panelId?: string;
      subject: string;
      details: string;
      category: string;
    }>
  ): Promise<TicketRecord> {
    return this.database.transaction(async (db) => {
      const [ticket] = await db
        .insert(tickets)
        .values({
          guildId: input.guildId,
          channelId: input.channelId,
          openerId: input.openerId,
          panelId: input.panelId,
          subject: input.subject,
          details: input.details,
          category: input.category,
          status: 'OPEN',
          priority: 'NORMAL'
        })
        .returning();
      if (!ticket) throw new Error('Unable to persist ticket.');
      await db.insert(ticketParticipants).values({
        ticketId: ticket.id,
        userId: input.openerId,
        addedBy: input.openerId
      });
      await db.insert(ticketTimelineEvents).values({
        ticketId: ticket.id,
        actorId: input.openerId,
        kind: 'ticket_created',
        details: { category: input.category, subject: input.subject }
      });
      return mapTicket(ticket);
    });
  }

  public async byId(guildId: string, ticketId: string): Promise<TicketRecord | undefined> {
    const ticket = await this.database.db.query.tickets.findFirst({
      where: and(eq(tickets.guildId, guildId), eq(tickets.id, ticketId))
    });
    return ticket ? mapTicket(ticket) : undefined;
  }

  public async byChannel(guildId: string, channelId: string): Promise<TicketRecord | undefined> {
    const ticket = await this.database.db.query.tickets.findFirst({
      where: and(eq(tickets.guildId, guildId), eq(tickets.channelId, channelId))
    });
    return ticket ? mapTicket(ticket) : undefined;
  }

  public async listForUser(guildId: string, openerId: string): Promise<readonly TicketRecord[]> {
    const records = await this.database.db.query.tickets.findMany({
      where: and(eq(tickets.guildId, guildId), eq(tickets.openerId, openerId)),
      orderBy: [desc(tickets.createdAt)],
      limit: 20
    });
    return records.map(mapTicket);
  }

  public async updateControlMessage(ticketId: string, messageId: string): Promise<void> {
    await this.database.db
      .update(tickets)
      .set({ controlMessageId: messageId })
      .where(eq(tickets.id, ticketId));
  }

  public async setClaim(
    id: string,
    claimedBy: string | null,
    actorId: string
  ): Promise<TicketRecord> {
    return this.database.transaction(async (db) => {
      const [ticket] = await db
        .update(tickets)
        .set({ claimedBy })
        .where(eq(tickets.id, id))
        .returning();
      if (!ticket) throw new ResourceNotFoundError('This ticket no longer exists.');
      await db.insert(ticketTimelineEvents).values({
        ticketId: id,
        actorId,
        kind: claimedBy ? 'ticket_claimed' : 'ticket_unclaimed',
        details: claimedBy ? { claimedBy } : {}
      });
      return mapTicket(ticket);
    });
  }

  public async close(id: string, actorId: string, reason?: string): Promise<TicketRecord> {
    return this.database.transaction(async (db) => {
      const [ticket] = await db
        .update(tickets)
        .set({
          status: 'CLOSED',
          closedAt: new Date(),
          closedBy: actorId,
          closedReason: reason ?? null
        })
        .where(and(eq(tickets.id, id), eq(tickets.status, 'OPEN')))
        .returning();
      if (!ticket)
        throw new ResourceNotFoundError('This ticket is already closed or no longer exists.');
      await db.insert(ticketTimelineEvents).values({
        ticketId: id,
        actorId,
        kind: 'ticket_closed',
        details: reason ? { reason } : {}
      });
      return mapTicket(ticket);
    });
  }

  public async reopen(id: string, actorId: string): Promise<TicketRecord> {
    return this.database.transaction(async (db) => {
      const [ticket] = await db
        .update(tickets)
        .set({ status: 'OPEN', closedAt: null, closedBy: null, closedReason: null })
        .where(and(eq(tickets.id, id), eq(tickets.status, 'CLOSED')))
        .returning();
      if (!ticket)
        throw new ResourceNotFoundError('This ticket is already open or no longer exists.');
      await db.insert(ticketTimelineEvents).values({
        ticketId: id,
        actorId,
        kind: 'ticket_reopened',
        details: {}
      });
      return mapTicket(ticket);
    });
  }

  public async setPriority(id: string, priority: string, actorId: string): Promise<TicketRecord> {
    return this.database.transaction(async (db) => {
      const [ticket] = await db
        .update(tickets)
        .set({ priority })
        .where(eq(tickets.id, id))
        .returning();
      if (!ticket) throw new ResourceNotFoundError('This ticket no longer exists.');
      await db.insert(ticketTimelineEvents).values({
        ticketId: id,
        actorId,
        kind: 'ticket_priority_changed',
        details: { priority }
      });
      return mapTicket(ticket);
    });
  }

  public async addParticipant(ticketId: string, userId: string, actorId: string): Promise<void> {
    await this.database.transaction(async (db) => {
      await db
        .insert(ticketParticipants)
        .values({ ticketId, userId, addedBy: actorId })
        .onConflictDoNothing();
      await db.insert(ticketTimelineEvents).values({
        ticketId,
        actorId,
        kind: 'ticket_participant_added',
        details: { userId }
      });
    });
  }

  public async removeParticipant(ticketId: string, userId: string, actorId: string): Promise<void> {
    await this.database.transaction(async (db) => {
      await db
        .delete(ticketParticipants)
        .where(
          and(eq(ticketParticipants.ticketId, ticketId), eq(ticketParticipants.userId, userId))
        );
      await db.insert(ticketTimelineEvents).values({
        ticketId,
        actorId,
        kind: 'ticket_participant_removed',
        details: { userId }
      });
    });
  }

  public async timeline(ticketId: string): Promise<readonly TicketTimelineEvent[]> {
    const events = await this.database.db.query.ticketTimelineEvents.findMany({
      where: eq(ticketTimelineEvents.ticketId, ticketId),
      orderBy: [desc(ticketTimelineEvents.createdAt)],
      limit: 20
    });
    return events.map((event) => ({
      id: event.id,
      ...(event.actorId ? { actorId: event.actorId } : {}),
      kind: event.kind,
      details: detailsObject(event.details),
      createdAt: event.createdAt
    }));
  }

  public async recordEvent(
    ticketId: string,
    kind: string,
    actorId?: string,
    details: Record<string, unknown> = {}
  ): Promise<void> {
    await this.database.db.insert(ticketTimelineEvents).values({
      ticketId,
      kind,
      ...(actorId ? { actorId } : {}),
      details
    });
  }

  public async deleteTicket(id: string, actorId: string): Promise<void> {
    await this.database.transaction(async (db) => {
      await db.insert(ticketTimelineEvents).values({
        ticketId: id,
        actorId,
        kind: 'ticket_deleted',
        details: {}
      });
      const result = await db
        .delete(tickets)
        .where(eq(tickets.id, id))
        .returning({ id: tickets.id });
      if (result.length === 0) throw new ResourceNotFoundError('This ticket no longer exists.');
    });
  }
}
