import type { RiskAssessment, SecurityEvent, SecurityThresholds, TrustLevel } from './types.js';

export type RiskInput = Readonly<{
  event: SecurityEvent;
  actorWindowCount: number;
  guildWindowCount: number;
  actionDiversity: number;
  trustLevel: TrustLevel;
  targetCriticality?: 'normal' | 'important' | 'critical' | 'immutable';
  hasPermissionEscalation?: boolean;
  isNovelBehavior?: boolean;
  coordinatedActorCount?: number;
  accountRisk?: 'low' | 'normal' | 'high';
  authorizedMaintenance?: boolean;
  thresholds: SecurityThresholds;
}>;

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

export const trustModifier = (trust: TrustLevel): number => {
  switch (trust) {
    case 'OWNER':
      return 0.75;
    case 'SECURITY_ADMIN':
      return 0.82;
    case 'TRUSTED_ADMIN':
      return 0.9;
    case 'MODERATOR':
      return 1;
    case 'AUTOMATION_BOT':
      return 0.9;
    case 'STANDARD':
      return 1.1;
    case 'UNKNOWN':
      return 1.25;
    case 'BLOCKED':
      return 1.75;
  }
};

export const velocityMultiplier = (
  actorWindowCount: number,
  guildWindowCount: number,
  diversity: number
): number => {
  let multiplier = 1;
  if (actorWindowCount >= 3 || guildWindowCount >= 5) multiplier = 1.35;
  if (actorWindowCount >= 5 || guildWindowCount >= 8) multiplier = 1.8;
  if (actorWindowCount >= 10 || guildWindowCount >= 14) multiplier = 2.4;
  if (diversity >= 3) multiplier += 0.3;
  if (diversity >= 5) multiplier += 0.35;
  return multiplier;
};

const criticalityMultiplier = (criticality: RiskInput['targetCriticality']): number => {
  switch (criticality) {
    case 'immutable':
      return 2;
    case 'critical':
      return 1.75;
    case 'important':
      return 1.35;
    default:
      return 1;
  }
};

const accountRiskMultiplier = (risk: RiskInput['accountRisk']): number => {
  switch (risk) {
    case 'high':
      return 1.35;
    case 'low':
      return 0.9;
    default:
      return 1;
  }
};

export const assessRisk = (input: RiskInput): RiskAssessment => {
  const factors = {
    actionWeight: input.event.actionWeight,
    velocityMultiplier: velocityMultiplier(
      input.actorWindowCount,
      input.guildWindowCount,
      input.actionDiversity
    ),
    targetCriticalityMultiplier: criticalityMultiplier(input.targetCriticality),
    permissionEscalationMultiplier: input.hasPermissionEscalation ? 1.5 : 1,
    noveltyMultiplier: input.isNovelBehavior ? 1.2 : 1,
    coordinationMultiplier:
      input.coordinatedActorCount && input.coordinatedActorCount > 1 ? 1.35 : 1,
    accountRiskMultiplier: accountRiskMultiplier(input.accountRisk),
    actorTrustModifier: trustModifier(input.trustLevel),
    maintenanceModifier: input.authorizedMaintenance ? 0.55 : 1,
    confidenceModifier: clamp(input.event.correlationConfidence / 100, 0.25, 1)
  };
  const score = Math.round(
    clamp(
      factors.actionWeight *
        factors.velocityMultiplier *
        factors.targetCriticalityMultiplier *
        factors.permissionEscalationMultiplier *
        factors.noveltyMultiplier *
        factors.coordinationMultiplier *
        factors.accountRiskMultiplier *
        factors.actorTrustModifier *
        factors.maintenanceModifier *
        factors.confidenceModifier,
      0,
      200
    )
  );
  const decision =
    score >= input.thresholds.emergency
      ? 'EMERGENCY'
      : score >= input.thresholds.contain
        ? 'CONTAIN'
        : score >= input.thresholds.observe
          ? 'ALERT'
          : 'OBSERVE';
  return {
    score,
    factors,
    actorWindowCount: input.actorWindowCount,
    guildWindowCount: input.guildWindowCount,
    actionDiversity: input.actionDiversity,
    decision
  };
};
