export const securityEventTypes = [
  'CHANNEL_CREATED',
  'CHANNEL_DELETED',
  'CHANNEL_UPDATED',
  'CATEGORY_CREATED',
  'CATEGORY_DELETED',
  'CATEGORY_UPDATED',
  'ROLE_CREATED',
  'ROLE_DELETED',
  'ROLE_UPDATED',
  'ADMINISTRATOR_GRANTED',
  'DANGEROUS_PERMISSION_GRANTED',
  'ROLE_HIERARCHY_CHANGED',
  'MEMBER_BANNED',
  'MEMBER_KICKED',
  'MASS_TIMEOUT',
  'WEBHOOK_CREATED',
  'WEBHOOK_UPDATED',
  'WEBHOOK_DELETED',
  'BOT_ADDED',
  'INTEGRATION_CREATED',
  'INTEGRATION_DELETED',
  'GUILD_UPDATED',
  'AUTOMOD_DELETED',
  'AUTOMOD_UPDATED',
  'EMOJI_DELETED',
  'STICKER_DELETED',
  'PERMISSION_OVERWRITE_UPDATED',
  'BOT_ROLE_MODIFIED',
  'BOT_PERMISSION_REMOVED',
  'PROTECTED_RESOURCE_MODIFIED',
  'CANARY_MODIFIED'
] as const;

export type SecurityEventType = (typeof securityEventTypes)[number];
export type SecurityTargetType =
  | 'channel'
  | 'category'
  | 'role'
  | 'member'
  | 'webhook'
  | 'integration'
  | 'guild'
  | 'automod_rule'
  | 'emoji'
  | 'sticker'
  | 'permission_overwrite'
  | 'unknown';
export type ActorType = 'user' | 'bot' | 'webhook' | 'integration' | 'unknown';
export type EventSource = 'gateway' | 'audit-log' | 'internal' | 'simulation';
export type TrustLevel =
  | 'OWNER'
  | 'SECURITY_ADMIN'
  | 'TRUSTED_ADMIN'
  | 'MODERATOR'
  | 'AUTOMATION_BOT'
  | 'STANDARD'
  | 'UNKNOWN'
  | 'BLOCKED';
export type SecurityState =
  'NORMAL' | 'ELEVATED' | 'CONTAINMENT' | 'LOCKDOWN' | 'RECOVERY' | 'DEGRADED';
export type SecurityMode = 'MONITOR' | 'BALANCED' | 'STRICT' | 'CUSTOM';
export type IncidentStatus =
  'OPEN' | 'INVESTIGATING' | 'CONTAINED' | 'RECOVERING' | 'RESOLVED' | 'FALSE_POSITIVE' | 'CLOSED';

export type SecurityEvent = Readonly<{
  id: string;
  guildId: string;
  eventType: SecurityEventType;
  occurredAt: Date;
  receivedAt: Date;
  targetId?: string;
  targetType?: SecurityTargetType;
  actorId?: string;
  actorType?: ActorType;
  auditLogEntryId?: string;
  source: EventSource;
  severity: number;
  actionWeight: number;
  metadata: Readonly<Record<string, unknown>>;
  correlationConfidence: number;
}>;

export type AuditCandidate = Readonly<{
  id: string;
  guildId: string;
  action: string;
  targetId?: string;
  executorId?: string;
  createdAt: Date;
  changes?: Readonly<Record<string, unknown>>;
  reason?: string | null;
}>;

export type Correlation = Readonly<{
  actorId?: string;
  auditLogEntryId?: string;
  confidence: number;
  evidence: Readonly<Record<string, unknown>>;
}>;

export type RiskFactors = Readonly<{
  actionWeight: number;
  velocityMultiplier: number;
  targetCriticalityMultiplier: number;
  permissionEscalationMultiplier: number;
  noveltyMultiplier: number;
  coordinationMultiplier: number;
  accountRiskMultiplier: number;
  actorTrustModifier: number;
  maintenanceModifier: number;
  confidenceModifier: number;
}>;

export type RiskAssessment = Readonly<{
  score: number;
  factors: RiskFactors;
  actorWindowCount: number;
  guildWindowCount: number;
  actionDiversity: number;
  decision: 'OBSERVE' | 'ALERT' | 'CONTAIN' | 'EMERGENCY';
}>;

export type SecurityThresholds = Readonly<{
  observe: number;
  contain: number;
  emergency: number;
  minimumConfidence: number;
}>;

export type SecurityPolicy = Readonly<{
  mode: SecurityMode;
  enabled: boolean;
  thresholds: SecurityThresholds;
  state: SecurityState;
}>;

export type MaintenanceSession = Readonly<{
  actorId: string;
  allowedEventTypes: readonly SecurityEventType[];
  maximumRisk: number;
  expiresAt: Date;
}>;

export type ContainmentDecision = Readonly<{
  shouldContain: boolean;
  shouldLockdown: boolean;
  reason: string;
}>;
