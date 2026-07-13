import { and, desc, eq, gt, isNull } from 'drizzle-orm';

import type { Database } from '../../infrastructure/database/database.js';
import {
  guilds,
  incidentTimeline,
  maintenanceSessions,
  securityEvents,
  securityIncidents,
  securityPolicies,
  trustedActors
} from '../../infrastructure/database/schema.js';
import type {
  IncidentStatus,
  MaintenanceSession,
  SecurityEvent,
  SecurityPolicy,
  SecurityState,
  TrustLevel
} from './types.js';

const defaultThresholds = { observe: 40, contain: 70, emergency: 100, minimumConfidence: 70 };

export type SecurityIncident = Readonly<{
  id: string;
  publicId: string;
  guildId: string;
  status: IncidentStatus;
  securityState: SecurityState;
  riskScore: number;
  confidence: number;
}>;

export interface SecurityPersistence {
  ensureGuild(guildId: string, name: string): Promise<void>;
  getPolicy(guildId: string): Promise<SecurityPolicy>;
  setEnabled(guildId: string, enabled: boolean): Promise<void>;
  setMode(guildId: string, mode: SecurityPolicy['mode']): Promise<void>;
  setState(guildId: string, state: SecurityState): Promise<void>;
  getTrust(guildId: string, actorId: string | undefined, isOwner: boolean): Promise<TrustLevel>;
  getMaintenance(
    guildId: string,
    actorId: string,
    now: Date
  ): Promise<MaintenanceSession | undefined>;
  recordEvent(event: SecurityEvent): Promise<void>;
  createIncident(input: {
    guildId: string;
    state: SecurityState;
    riskScore: number;
    confidence: number;
    event: SecurityEvent;
  }): Promise<SecurityIncident>;
  addTimeline(
    incidentId: string,
    kind: string,
    details: Readonly<Record<string, unknown>>,
    eventId?: string
  ): Promise<void>;
  latestOpenIncident(guildId: string): Promise<SecurityIncident | undefined>;
}

const eventMetadata = (metadata: Readonly<Record<string, unknown>>): Record<string, unknown> => ({
  ...metadata
});

export class PostgresSecurityRepository implements SecurityPersistence {
  public constructor(private readonly database: Database) {}

  public async ensureGuild(guildId: string, name: string): Promise<void> {
    await this.database.db
      .insert(guilds)
      .values({ id: guildId, name })
      .onConflictDoUpdate({ target: guilds.id, set: { name, updatedAt: new Date() } });
  }

  public async getPolicy(guildId: string): Promise<SecurityPolicy> {
    const row = await this.database.db.query.securityPolicies.findFirst({
      where: eq(securityPolicies.guildId, guildId)
    });
    if (!row) {
      await this.database.db.insert(securityPolicies).values({ guildId }).onConflictDoNothing();
      return { enabled: true, mode: 'BALANCED', state: 'NORMAL', thresholds: defaultThresholds };
    }
    return {
      enabled: row.enabled,
      mode: row.mode as SecurityPolicy['mode'],
      state: row.state,
      thresholds: {
        observe: row.observeThreshold,
        contain: row.containThreshold,
        emergency: row.emergencyThreshold,
        minimumConfidence: row.minimumConfidence
      }
    };
  }

  public async setState(guildId: string, state: SecurityState): Promise<void> {
    await this.database.db
      .insert(securityPolicies)
      .values({ guildId, state })
      .onConflictDoUpdate({
        target: securityPolicies.guildId,
        set: { state, updatedAt: new Date() }
      });
  }

  public async setEnabled(guildId: string, enabled: boolean): Promise<void> {
    await this.database.db
      .insert(securityPolicies)
      .values({ guildId, enabled })
      .onConflictDoUpdate({
        target: securityPolicies.guildId,
        set: { enabled, updatedAt: new Date() }
      });
  }

  public async setMode(guildId: string, mode: SecurityPolicy['mode']): Promise<void> {
    await this.database.db
      .insert(securityPolicies)
      .values({ guildId, mode })
      .onConflictDoUpdate({
        target: securityPolicies.guildId,
        set: { mode, updatedAt: new Date() }
      });
  }

  public async getTrust(
    guildId: string,
    actorId: string | undefined,
    isOwner: boolean
  ): Promise<TrustLevel> {
    if (isOwner) return 'OWNER';
    if (!actorId) return 'UNKNOWN';
    const actor = await this.database.db.query.trustedActors.findFirst({
      where: and(eq(trustedActors.guildId, guildId), eq(trustedActors.actorId, actorId))
    });
    if (!actor || (actor.expiresAt && actor.expiresAt <= new Date())) return 'STANDARD';
    return actor.level;
  }

  public async getMaintenance(
    guildId: string,
    actorId: string,
    now: Date
  ): Promise<MaintenanceSession | undefined> {
    const session = await this.database.db.query.maintenanceSessions.findFirst({
      where: and(
        eq(maintenanceSessions.guildId, guildId),
        eq(maintenanceSessions.actorId, actorId),
        gt(maintenanceSessions.expiresAt, now),
        isNull(maintenanceSessions.endedAt)
      ),
      orderBy: [desc(maintenanceSessions.expiresAt)]
    });
    if (!session) return undefined;
    const allowed = Array.isArray(session.allowedActions)
      ? session.allowedActions.filter((value): value is string => typeof value === 'string')
      : [];
    return {
      actorId: session.actorId,
      allowedEventTypes: allowed as MaintenanceSession['allowedEventTypes'],
      maximumRisk: session.riskAllowance,
      expiresAt: session.expiresAt
    };
  }

  public async recordEvent(event: SecurityEvent): Promise<void> {
    await this.database.db.insert(securityEvents).values({
      id: event.id,
      guildId: event.guildId,
      eventType: event.eventType,
      occurredAt: event.occurredAt,
      receivedAt: event.receivedAt,
      targetId: event.targetId ?? null,
      targetType: event.targetType ?? null,
      actorId: event.actorId ?? null,
      actorType: event.actorType ?? null,
      auditLogEntryId: event.auditLogEntryId ?? null,
      source: event.source,
      severity: event.severity,
      actionWeight: event.actionWeight,
      correlationConfidence: event.correlationConfidence,
      metadata: eventMetadata(event.metadata)
    });
  }

  public async createIncident(input: {
    guildId: string;
    state: SecurityState;
    riskScore: number;
    confidence: number;
    event: SecurityEvent;
  }): Promise<SecurityIncident> {
    const publicId = `BLE-INC-${input.event.occurredAt.getUTCFullYear()}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
    const [record] = await this.database.db
      .insert(securityIncidents)
      .values({
        publicId,
        guildId: input.guildId,
        status: 'OPEN',
        securityState: input.state,
        riskScore: input.riskScore,
        confidence: input.confidence,
        firstEventAt: input.event.occurredAt,
        lastEventAt: input.event.occurredAt,
        summary: `${input.event.eventType} triggered BLE Shield review.`
      })
      .returning();
    if (!record) throw new Error('Failed to create security incident.');
    await this.addTimeline(
      record.id,
      'DETECTED',
      { eventType: input.event.eventType, riskScore: input.riskScore },
      input.event.id
    );
    return {
      id: record.id,
      publicId: record.publicId,
      guildId: record.guildId,
      status: record.status,
      securityState: record.securityState,
      riskScore: record.riskScore,
      confidence: record.confidence
    };
  }

  public async addTimeline(
    incidentId: string,
    kind: string,
    details: Readonly<Record<string, unknown>>,
    eventId?: string
  ): Promise<void> {
    await this.database.db.insert(incidentTimeline).values({
      incidentId,
      eventId: eventId ?? null,
      kind,
      details: { ...details }
    });
  }

  public async latestOpenIncident(guildId: string): Promise<SecurityIncident | undefined> {
    const record = await this.database.db.query.securityIncidents.findFirst({
      where: and(eq(securityIncidents.guildId, guildId), eq(securityIncidents.status, 'OPEN')),
      orderBy: [desc(securityIncidents.createdAt)]
    });
    if (!record) return undefined;
    return {
      id: record.id,
      publicId: record.publicId,
      guildId: record.guildId,
      status: record.status,
      securityState: record.securityState,
      riskScore: record.riskScore,
      confidence: record.confidence
    };
  }
}
