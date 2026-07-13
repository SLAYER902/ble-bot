import { type Guild } from 'discord.js';
import type { Logger } from 'pino';

import { weightFor } from './action-weights.js';
import type { AuditResolver } from './audit-resolver.js';
import type { SecurityProcessResult, SecurityService } from './security-service.js';
import type { ActorType, SecurityEvent, SecurityEventType, SecurityTargetType } from './types.js';

export type GatewaySecurityInput = Readonly<{
  eventType: SecurityEventType;
  targetId?: string;
  targetType?: SecurityTargetType;
  severity?: number;
  metadata?: Readonly<Record<string, unknown>>;
}>;

export class DiscordSecurityIngestor {
  public constructor(
    private readonly security: SecurityService,
    private readonly auditResolver: AuditResolver,
    private readonly logger: Logger
  ) {}

  public async ingest(guild: Guild, input: GatewaySecurityInput): Promise<SecurityProcessResult> {
    const occurredAt = new Date();
    const initial: SecurityEvent = {
      id: crypto.randomUUID(),
      guildId: guild.id,
      eventType: input.eventType,
      occurredAt,
      receivedAt: new Date(),
      ...(input.targetId ? { targetId: input.targetId } : {}),
      ...(input.targetType ? { targetType: input.targetType } : {}),
      source: 'gateway',
      severity: input.severity ?? Math.min(100, weightFor(input.eventType)),
      actionWeight: weightFor(input.eventType),
      metadata: input.metadata ?? {},
      correlationConfidence: 0
    };
    const correlation = await this.auditResolver.resolve(guild, initial);
    const actorType: ActorType | undefined = correlation.actorId ? 'user' : undefined;
    const event: SecurityEvent = {
      ...initial,
      ...(correlation.actorId ? { actorId: correlation.actorId } : {}),
      ...(actorType ? { actorType } : {}),
      ...(correlation.auditLogEntryId ? { auditLogEntryId: correlation.auditLogEntryId } : {}),
      correlationConfidence: correlation.confidence,
      metadata: { ...initial.metadata, correlation: correlation.evidence }
    };
    const result = await this.security.process(event, {
      guildName: guild.name,
      isGuildOwner: event.actorId === guild.ownerId,
      coordinatedActorCount: 0
    });
    this.logger.info(
      {
        guildId: guild.id,
        eventType: event.eventType,
        risk: result.riskScore,
        decision: result.decision
      },
      'BLE Shield processed gateway event'
    );
    return result;
  }
}
