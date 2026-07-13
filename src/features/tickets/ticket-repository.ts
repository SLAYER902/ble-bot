import { and, desc, eq } from 'drizzle-orm';

import type { Database } from '../../infrastructure/database/database.js';
import { guilds, tickets } from '../../infrastructure/database/schema.js';

export type TicketRecord = Readonly<{
  id: string;
  guildId: string;
  channelId: string;
  openerId: string;
  claimedBy?: string;
  status: string;
  priority: string;
  category: string;
}>;

const mapTicket = (ticket: typeof tickets.$inferSelect): TicketRecord => ({
  id: ticket.id,
  guildId: ticket.guildId,
  channelId: ticket.channelId,
  openerId: ticket.openerId,
  ...(ticket.claimedBy ? { claimedBy: ticket.claimedBy } : {}),
  status: ticket.status,
  priority: ticket.priority,
  category: ticket.category
});

export class TicketRepository {
  public constructor(private readonly database: Database) {}

  public async ensureGuild(guildId: string, name: string): Promise<void> {
    await this.database.db
      .insert(guilds)
      .values({ id: guildId, name })
      .onConflictDoUpdate({ target: guilds.id, set: { name, updatedAt: new Date() } });
  }

  public async create(
    input: Omit<TicketRecord, 'id' | 'claimedBy' | 'status' | 'priority'>
  ): Promise<TicketRecord> {
    const [ticket] = await this.database.db
      .insert(tickets)
      .values({
        guildId: input.guildId,
        channelId: input.channelId,
        openerId: input.openerId,
        category: input.category,
        status: 'OPEN',
        priority: 'NORMAL'
      })
      .returning();
    if (!ticket) throw new Error('Unable to persist ticket.');
    return mapTicket(ticket);
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

  public async setStatus(id: string, status: 'OPEN' | 'CLOSED'): Promise<TicketRecord> {
    const [ticket] = await this.database.db
      .update(tickets)
      .set({ status, ...(status === 'CLOSED' ? { closedAt: new Date() } : { closedAt: null }) })
      .where(eq(tickets.id, id))
      .returning();
    if (!ticket) throw new Error('Ticket was not found while updating it.');
    return mapTicket(ticket);
  }

  public async setClaim(id: string, claimedBy: string | null): Promise<TicketRecord> {
    const [ticket] = await this.database.db
      .update(tickets)
      .set({ claimedBy })
      .where(eq(tickets.id, id))
      .returning();
    if (!ticket) throw new Error('Ticket was not found while updating its claim.');
    return mapTicket(ticket);
  }
}
