import { AuditLogEvent, type Guild } from 'discord.js';
import type { Logger } from 'pino';

import { correlateAuditEvent, expectedAuditAction } from './correlation.js';
import type { Correlation, SecurityEvent } from './types.js';

const auditTypes: Partial<Record<SecurityEvent['eventType'], AuditLogEvent>> = {
  CHANNEL_CREATED: AuditLogEvent.ChannelCreate,
  CHANNEL_DELETED: AuditLogEvent.ChannelDelete,
  CHANNEL_UPDATED: AuditLogEvent.ChannelUpdate,
  CATEGORY_CREATED: AuditLogEvent.ChannelCreate,
  CATEGORY_DELETED: AuditLogEvent.ChannelDelete,
  CATEGORY_UPDATED: AuditLogEvent.ChannelUpdate,
  ROLE_CREATED: AuditLogEvent.RoleCreate,
  ROLE_DELETED: AuditLogEvent.RoleDelete,
  ROLE_UPDATED: AuditLogEvent.RoleUpdate,
  MEMBER_BANNED: AuditLogEvent.MemberBanAdd,
  WEBHOOK_CREATED: AuditLogEvent.WebhookCreate,
  WEBHOOK_UPDATED: AuditLogEvent.WebhookUpdate,
  WEBHOOK_DELETED: AuditLogEvent.WebhookDelete,
  BOT_ADDED: AuditLogEvent.BotAdd,
  GUILD_UPDATED: AuditLogEvent.GuildUpdate,
  AUTOMOD_DELETED: AuditLogEvent.AutoModerationRuleDelete,
  AUTOMOD_UPDATED: AuditLogEvent.AutoModerationRuleUpdate
};

const backoffMs = [250, 600, 1_200, 2_000] as const;
const delay = (milliseconds: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

export class AuditResolver {
  public constructor(private readonly logger: Logger) {}

  public async resolve(guild: Guild, event: SecurityEvent): Promise<Correlation> {
    const type = auditTypes[event.eventType];
    const expected = expectedAuditAction(event);
    if (type === undefined || !expected)
      return { confidence: 0, evidence: { reason: 'No reliable audit action mapping.' } };
    for (let attempt = 0; attempt < backoffMs.length; attempt += 1) {
      const baseDelay = backoffMs[attempt];
      if (baseDelay === undefined) continue;
      await delay(baseDelay + Math.floor(Math.random() * 100));
      try {
        const logs = await guild.fetchAuditLogs({ type, limit: 6 });
        const candidates = logs.entries.map((entry) => ({
          id: entry.id,
          guildId: guild.id,
          action: expected,
          ...(entry.targetId ? { targetId: entry.targetId } : {}),
          ...(entry.executorId ? { executorId: entry.executorId } : {}),
          createdAt: new Date(entry.createdTimestamp),
          ...(entry.reason ? { reason: entry.reason } : {})
        }));
        const correlation = correlateAuditEvent(event, candidates);
        if (correlation.confidence >= 70) {
          return { ...correlation, evidence: { ...correlation.evidence, attempt: attempt + 1 } };
        }
      } catch (error) {
        this.logger.warn(
          { guildId: guild.id, eventId: event.id, attempt: attempt + 1, err: error },
          'Audit correlation attempt failed'
        );
      }
    }
    return {
      confidence: 0,
      evidence: { expectedAction: expected, attempts: backoffMs.length, matched: false }
    };
  }
}
