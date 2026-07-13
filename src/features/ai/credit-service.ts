import { and, eq, gte, sql } from 'drizzle-orm';

import { PremiumRequiredError } from '../../errors/domain-error.js';
import type { Database } from '../../infrastructure/database/database.js';
import {
  aiCreditBalances,
  aiReservations,
  aiUsageLedger
} from '../../infrastructure/database/schema.js';

export type CreditReservation = Readonly<{
  id: string;
  guildId: string;
  userId: string;
  credits: number;
  kind: string;
}>;

export interface CreditRepository {
  reserve(reservation: CreditReservation): Promise<void>;
  commit(reservationId: string): Promise<void>;
  refund(reservationId: string): Promise<void>;
}

const periodStart = (): Date => {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
};

export class PostgresCreditRepository implements CreditRepository {
  public constructor(private readonly database: Database) {}

  public async reserve(reservation: CreditReservation): Promise<void> {
    await this.database.transaction(async (db) => {
      await db
        .insert(aiCreditBalances)
        .values({
          guildId: reservation.guildId,
          periodStart: periodStart(),
          available: 10,
          reserved: 0
        })
        .onConflictDoNothing();
      const balance = await db
        .update(aiCreditBalances)
        .set({
          available: sql`${aiCreditBalances.available} - ${reservation.credits}`,
          reserved: sql`${aiCreditBalances.reserved} + ${reservation.credits}`,
          updatedAt: new Date()
        })
        .where(
          and(
            eq(aiCreditBalances.guildId, reservation.guildId),
            gte(aiCreditBalances.available, reservation.credits)
          )
        )
        .returning({ guildId: aiCreditBalances.guildId });
      if (balance.length === 0) throw new PremiumRequiredError();
      await db.insert(aiReservations).values({
        id: reservation.id,
        guildId: reservation.guildId,
        userId: reservation.userId,
        credits: reservation.credits,
        kind: reservation.kind,
        status: 'RESERVED'
      });
    });
  }

  public async commit(reservationId: string): Promise<void> {
    await this.database.transaction(async (db) => {
      const reservation = await db
        .update(aiReservations)
        .set({ status: 'COMMITTED', settledAt: new Date() })
        .where(and(eq(aiReservations.id, reservationId), eq(aiReservations.status, 'RESERVED')))
        .returning();
      const item = reservation[0];
      if (!item) return;
      await db
        .update(aiCreditBalances)
        .set({
          reserved: sql`${aiCreditBalances.reserved} - ${item.credits}`,
          updatedAt: new Date()
        })
        .where(eq(aiCreditBalances.guildId, item.guildId));
      await db.insert(aiUsageLedger).values({
        guildId: item.guildId,
        userId: item.userId,
        reservationId: item.id,
        credits: item.credits,
        kind: item.kind
      });
    });
  }

  public async refund(reservationId: string): Promise<void> {
    await this.database.transaction(async (db) => {
      const reservation = await db
        .update(aiReservations)
        .set({ status: 'REFUNDED', settledAt: new Date() })
        .where(and(eq(aiReservations.id, reservationId), eq(aiReservations.status, 'RESERVED')))
        .returning();
      const item = reservation[0];
      if (!item) return;
      await db
        .update(aiCreditBalances)
        .set({
          available: sql`${aiCreditBalances.available} + ${item.credits}`,
          reserved: sql`${aiCreditBalances.reserved} - ${item.credits}`,
          updatedAt: new Date()
        })
        .where(eq(aiCreditBalances.guildId, item.guildId));
    });
  }
}

export class CreditService {
  public constructor(private readonly repository: CreditRepository) {}

  public async run<T>(input: Omit<CreditReservation, 'id'>, work: () => Promise<T>): Promise<T> {
    const reservation: CreditReservation = { ...input, id: crypto.randomUUID() };
    await this.repository.reserve(reservation);
    try {
      const result = await work();
      await this.repository.commit(reservation.id);
      return result;
    } catch (error) {
      await this.repository.refund(reservation.id);
      throw error;
    }
  }
}
