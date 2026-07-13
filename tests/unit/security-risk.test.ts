import { describe, expect, it } from 'vitest';

import { correlateAuditEvent } from '../../src/features/security/correlation.js';
import {
  assessRisk,
  trustModifier,
  velocityMultiplier
} from '../../src/features/security/risk-engine.js';
import { transition } from '../../src/features/security/state-machine.js';
import type { SecurityEvent } from '../../src/features/security/types.js';

const event = (overrides: Partial<SecurityEvent> = {}): SecurityEvent => ({
  id: '00000000-0000-4000-8000-000000000001',
  guildId: '123456789012345678',
  eventType: 'CHANNEL_DELETED',
  occurredAt: new Date('2026-01-01T00:00:00.000Z'),
  receivedAt: new Date('2026-01-01T00:00:00.000Z'),
  targetId: '223456789012345678',
  targetType: 'channel',
  actorId: '323456789012345678',
  actorType: 'user',
  source: 'simulation',
  severity: 35,
  actionWeight: 35,
  metadata: {},
  correlationConfidence: 90,
  ...overrides
});

describe('BLE Shield risk engine', () => {
  it('increases score for destructive velocity and action diversity', () => {
    const assessment = assessRisk({
      event: event(),
      actorWindowCount: 5,
      guildWindowCount: 8,
      actionDiversity: 3,
      trustLevel: 'STANDARD',
      targetCriticality: 'critical',
      accountRisk: 'high',
      thresholds: { observe: 40, contain: 70, emergency: 100, minimumConfidence: 70 }
    });
    expect(assessment.score).toBeGreaterThanOrEqual(70);
    expect(assessment.decision).toBe('EMERGENCY');
  });

  it('reduces sensitivity for maintenance but does not erase risk', () => {
    const normal = assessRisk({
      event: event(),
      actorWindowCount: 1,
      guildWindowCount: 1,
      actionDiversity: 1,
      trustLevel: 'TRUSTED_ADMIN',
      thresholds: { observe: 40, contain: 70, emergency: 100, minimumConfidence: 70 }
    });
    const maintained = assessRisk({
      event: event(),
      actorWindowCount: 1,
      guildWindowCount: 1,
      actionDiversity: 1,
      trustLevel: 'TRUSTED_ADMIN',
      authorizedMaintenance: true,
      thresholds: { observe: 40, contain: 70, emergency: 100, minimumConfidence: 70 }
    });
    expect(maintained.score).toBeGreaterThan(0);
    expect(maintained.score).toBeLessThan(normal.score);
  });

  it('keeps blocked actors more sensitive than trusted administrators', () => {
    expect(trustModifier('BLOCKED')).toBeGreaterThan(trustModifier('TRUSTED_ADMIN'));
    expect(velocityMultiplier(10, 14, 5)).toBeGreaterThan(velocityMultiplier(1, 1, 1));
  });

  it('has explicit modifiers for every trust and velocity tier', () => {
    const modifiers = [
      'OWNER',
      'SECURITY_ADMIN',
      'TRUSTED_ADMIN',
      'MODERATOR',
      'AUTOMATION_BOT',
      'STANDARD',
      'UNKNOWN',
      'BLOCKED'
    ] as const;
    for (const level of modifiers) expect(trustModifier(level)).toBeGreaterThan(0);
    expect(velocityMultiplier(3, 1, 1)).toBeGreaterThan(1);
    expect(velocityMultiplier(1, 5, 1)).toBeGreaterThan(1);
    expect(velocityMultiplier(1, 1, 3)).toBeGreaterThan(1);
  });

  it('uses criticality, account-risk, confidence, and escalation factors', () => {
    const thresholds = { observe: 40, contain: 70, emergency: 100, minimumConfidence: 70 };
    const low = assessRisk({
      event: event({ correlationConfidence: 20 }),
      actorWindowCount: 1,
      guildWindowCount: 1,
      actionDiversity: 1,
      trustLevel: 'OWNER',
      targetCriticality: 'normal',
      accountRisk: 'low',
      thresholds
    });
    const high = assessRisk({
      event: event({ correlationConfidence: 100 }),
      actorWindowCount: 2,
      guildWindowCount: 2,
      actionDiversity: 2,
      trustLevel: 'UNKNOWN',
      targetCriticality: 'immutable',
      accountRisk: 'high',
      hasPermissionEscalation: true,
      isNovelBehavior: true,
      coordinatedActorCount: 2,
      thresholds
    });
    expect(high.score).toBeGreaterThan(low.score);
  });
});

describe('audit correlation', () => {
  it('correlates matching target and close timestamp', () => {
    const correlation = correlateAuditEvent(event(), [
      {
        id: '423456789012345678',
        guildId: '123456789012345678',
        action: 'CHANNEL_DELETE',
        targetId: '223456789012345678',
        executorId: '323456789012345678',
        createdAt: new Date('2026-01-01T00:00:01.000Z')
      }
    ]);
    expect(correlation.actorId).toBe('323456789012345678');
    expect(correlation.confidence).toBeGreaterThanOrEqual(90);
  });

  it('does not attribute an unrelated audit entry', () => {
    const correlation = correlateAuditEvent(event(), [
      {
        id: '423456789012345678',
        guildId: '123456789012345678',
        action: 'ROLE_DELETE',
        targetId: '999999999999999999',
        executorId: '323456789012345678',
        createdAt: new Date('2026-01-01T01:00:00.000Z')
      }
    ]);
    expect(correlation.actorId).toBeUndefined();
    expect(correlation.confidence).toBe(0);
  });

  it('never attributes an event with no reliable audit action mapping', () => {
    const correlation = correlateAuditEvent(event({ eventType: 'CANARY_MODIFIED' }), [
      {
        id: '423456789012345678',
        guildId: '123456789012345678',
        action: 'CHANNEL_DELETE',
        targetId: '223456789012345678',
        executorId: '323456789012345678',
        createdAt: new Date('2026-01-01T00:00:00.000Z')
      }
    ]);
    expect(correlation.confidence).toBe(0);
  });
});

describe('security state machine', () => {
  it('only escalates through explicit transitions', () => {
    expect(transition('NORMAL', 'ELEVATED_ACTIVITY')?.to).toBe('ELEVATED');
    expect(transition('ELEVATED', 'CONFIRMED_CONTAINMENT')?.to).toBe('CONTAINMENT');
    expect(transition('CONTAINMENT', 'COORDINATED_ATTACK')?.to).toBe('LOCKDOWN');
    expect(transition('DEGRADED', 'ELEVATED_ACTIVITY')).toBeUndefined();
  });

  it('covers containment, recovery, manual, and dependency state changes', () => {
    expect(transition('NORMAL', 'DEPENDENCY_FAILURE')?.to).toBe('DEGRADED');
    expect(transition('ELEVATED', 'CIRCUIT_OPEN')?.to).toBe('DEGRADED');
    expect(transition('NORMAL', 'MANUAL_LOCKDOWN')?.to).toBe('LOCKDOWN');
    expect(transition('LOCKDOWN', 'MANUAL_UNLOCK')?.to).toBe('RECOVERY');
    expect(transition('CONTAINMENT', 'ACTIVITY_STOPPED')?.to).toBe('RECOVERY');
    expect(transition('LOCKDOWN', 'ACTIVITY_STOPPED')?.to).toBe('RECOVERY');
    expect(transition('RECOVERY', 'RECOVERY_VERIFIED')?.to).toBe('NORMAL');
    expect(transition('ELEVATED', 'ELEVATED_ACTIVITY')).toBeUndefined();
    expect(transition('CONTAINMENT', 'CONFIRMED_CONTAINMENT')).toBeUndefined();
    expect(transition('LOCKDOWN', 'CONFIRMED_CONTAINMENT')).toBeUndefined();
    expect(transition('RECOVERY', 'ACTIVITY_STOPPED')).toBeUndefined();
  });
});
