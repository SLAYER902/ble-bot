import type { AuditCandidate, Correlation, SecurityEvent } from './types.js';

export const expectedAuditAction = (event: SecurityEvent): string | undefined => {
  const mapping: Partial<Record<SecurityEvent['eventType'], string>> = {
    CHANNEL_CREATED: 'CHANNEL_CREATE',
    CHANNEL_DELETED: 'CHANNEL_DELETE',
    CHANNEL_UPDATED: 'CHANNEL_UPDATE',
    CATEGORY_CREATED: 'CHANNEL_CREATE',
    CATEGORY_DELETED: 'CHANNEL_DELETE',
    CATEGORY_UPDATED: 'CHANNEL_UPDATE',
    ROLE_CREATED: 'ROLE_CREATE',
    ROLE_DELETED: 'ROLE_DELETE',
    ROLE_UPDATED: 'ROLE_UPDATE',
    MEMBER_BANNED: 'MEMBER_BAN_ADD',
    WEBHOOK_CREATED: 'WEBHOOK_CREATE',
    WEBHOOK_UPDATED: 'WEBHOOK_UPDATE',
    WEBHOOK_DELETED: 'WEBHOOK_DELETE',
    BOT_ADDED: 'BOT_ADD',
    GUILD_UPDATED: 'GUILD_UPDATE',
    AUTOMOD_DELETED: 'AUTO_MODERATION_RULE_DELETE',
    AUTOMOD_UPDATED: 'AUTO_MODERATION_RULE_UPDATE'
  };
  return mapping[event.eventType];
};

export const correlateAuditEvent = (
  event: SecurityEvent,
  candidates: readonly AuditCandidate[]
): Correlation => {
  const expectedAction = expectedAuditAction(event);
  if (!expectedAction) {
    return { confidence: 0, evidence: { candidateCount: candidates.length, matched: false } };
  }
  const scored = candidates
    .filter((candidate) => candidate.guildId === event.guildId)
    .map((candidate) => {
      let score = 0;
      if (expectedAction && candidate.action === expectedAction) score += 35;
      if (event.targetId && candidate.targetId === event.targetId) score += 40;
      const delta = Math.abs(candidate.createdAt.getTime() - event.occurredAt.getTime());
      if (delta <= 2_500) score += 20;
      else if (delta <= 10_000) score += 10;
      if (candidate.changes && Object.keys(candidate.changes).length > 0) score += 5;
      return { candidate, score: Math.min(score, 100), delta };
    })
    .sort((left, right) => right.score - left.score || left.delta - right.delta);
  const best = scored[0];
  if (!best || best.score < 45 || !best.candidate.executorId) {
    return {
      confidence: 0,
      evidence: { expectedAction, candidateCount: candidates.length, matched: false }
    };
  }
  return {
    actorId: best.candidate.executorId,
    auditLogEntryId: best.candidate.id,
    confidence: best.score,
    evidence: {
      expectedAction,
      candidateCount: candidates.length,
      targetMatched: best.candidate.targetId === event.targetId,
      timeDeltaMs: best.delta
    }
  };
};
