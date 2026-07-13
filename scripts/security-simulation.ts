import { strict as assert } from 'node:assert';

import { ConfigurationError } from '../src/errors/domain-error.js';
import { assessRisk } from '../src/features/security/risk-engine.js';
import { transition } from '../src/features/security/state-machine.js';
import type { SecurityEvent } from '../src/features/security/types.js';

if (process.env.NODE_ENV === 'production')
  throw new ConfigurationError('Security simulations are disabled in production.');
const baseEvent = (
  eventType: SecurityEvent['eventType'],
  weight: number,
  confidence = 90
): SecurityEvent => ({
  id: crypto.randomUUID(),
  guildId: 'simulation-guild',
  eventType,
  occurredAt: new Date(),
  receivedAt: new Date(),
  targetId: 'target',
  targetType: 'channel',
  actorId: 'actor',
  actorType: 'user',
  source: 'simulation',
  severity: weight,
  actionWeight: weight,
  metadata: {},
  correlationConfidence: confidence
});
const thresholds = { observe: 40, contain: 70, emergency: 100, minimumConfidence: 70 };
const legitimateRename = assessRisk({
  event: baseEvent('CHANNEL_UPDATED', 2),
  actorWindowCount: 1,
  guildWindowCount: 1,
  actionDiversity: 1,
  trustLevel: 'TRUSTED_ADMIN',
  thresholds
});
const destructiveBurst = assessRisk({
  event: baseEvent('CHANNEL_DELETED', 35),
  actorWindowCount: 5,
  guildWindowCount: 8,
  actionDiversity: 3,
  trustLevel: 'STANDARD',
  targetCriticality: 'critical',
  thresholds
});
const unresolved = assessRisk({
  event: baseEvent('ROLE_DELETED', 45, 0),
  actorWindowCount: 4,
  guildWindowCount: 4,
  actionDiversity: 2,
  trustLevel: 'UNKNOWN',
  thresholds
});
assert.equal(legitimateRename.decision, 'OBSERVE');
assert.ok(destructiveBurst.score >= thresholds.contain);
assert.ok(unresolved.score > 0);
assert.equal(transition('NORMAL', 'ELEVATED_ACTIVITY')?.to, 'ELEVATED');
assert.equal(transition('ELEVATED', 'COORDINATED_ATTACK')?.to, 'LOCKDOWN');
console.log(
  'Security simulation passed: legitimate activity stays low, destructive activity escalates, and unresolved actors remain review-only.'
);
