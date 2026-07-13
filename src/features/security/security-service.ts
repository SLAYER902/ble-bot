import type { Logger } from 'pino';

import { RedisUnavailableError } from '../../errors/domain-error.js';
import type { Metrics } from '../../infrastructure/metrics/metrics.js';
import type { SlidingWindow } from '../../infrastructure/redis/sliding-window.js';
import { assessRisk } from './risk-engine.js';
import type { ContainmentExecutor } from './containment.js';
import { transition } from './state-machine.js';
import type { SecurityPersistence } from './security-repository.js';
import { securityEventTypes, type SecurityEvent, type SecurityState } from './types.js';

export type SecurityProcessContext = Readonly<{
  guildName: string;
  isGuildOwner: boolean;
  targetCriticality?: 'normal' | 'important' | 'critical' | 'immutable';
  isNovelBehavior?: boolean;
  accountRisk?: 'low' | 'normal' | 'high';
  coordinatedActorCount?: number;
  authorizedMaintenance?: boolean;
}>;

export type SecurityProcessResult = Readonly<{
  event: SecurityEvent;
  riskScore: number;
  decision: 'OBSERVE' | 'ALERT' | 'CONTAIN' | 'EMERGENCY';
  state: SecurityState;
  incidentPublicId?: string;
  contained: boolean;
  degraded: boolean;
  explanation: readonly string[];
}>;

const eventWindowMs = 15_000;
const actorWindowMs = 15_000;
const guildWindowMs = 15_000;

export class SecurityService {
  public constructor(
    private readonly persistence: SecurityPersistence,
    private readonly windows: SlidingWindow,
    private readonly containment: ContainmentExecutor,
    private readonly logger: Logger,
    private readonly metrics: Metrics
  ) {}

  public async process(
    event: SecurityEvent,
    context: SecurityProcessContext
  ): Promise<SecurityProcessResult> {
    await this.persistence.ensureGuild(event.guildId, context.guildName);
    const policy = await this.persistence.getPolicy(event.guildId);
    await this.persistence.recordEvent(event);
    this.metrics.securityEvents.inc({ event_type: event.eventType, source: event.source });

    if (!policy.enabled) {
      return {
        event,
        riskScore: 0,
        decision: 'OBSERVE',
        state: policy.state,
        contained: false,
        degraded: policy.state === 'DEGRADED',
        explanation: ['BLE Shield is disabled by guild policy; the event was recorded only.']
      };
    }

    try {
      return await this.processWithAtomicWindows(event, context, policy);
    } catch (error) {
      if (error instanceof RedisUnavailableError) {
        await this.persistence.setState(event.guildId, 'DEGRADED');
        this.logger.error(
          { guildId: event.guildId, eventId: event.id, err: error },
          'BLE Shield entered degraded mode'
        );
        return {
          event,
          riskScore: 0,
          decision: 'OBSERVE',
          state: 'DEGRADED',
          contained: false,
          degraded: true,
          explanation: [
            'Redis atomic rolling windows are unavailable. Automated containment was stopped.'
          ]
        };
      }
      throw error;
    }
  }

  private async processWithAtomicWindows(
    event: SecurityEvent,
    context: SecurityProcessContext,
    policy: Awaited<ReturnType<SecurityPersistence['getPolicy']>>
  ): Promise<SecurityProcessResult> {
    const now = event.occurredAt.getTime();
    const actorKey = `ble:security:risk:${event.guildId}:${event.actorId ?? 'unknown'}`;
    const guildKey = `ble:security:guild-risk:${event.guildId}`;
    const typeKey = `ble:security:event:${event.guildId}:${event.eventType}`;
    const [actorWindowCount, guildWindowCount] = await Promise.all([
      this.windows.recordAndCount(actorKey, now, actorWindowMs),
      this.windows.recordAndCount(guildKey, now, guildWindowMs),
      this.windows.recordAndCount(typeKey, now, eventWindowMs)
    ]);
    const diversityCounts = await Promise.all(
      securityEventTypes.map((eventType) =>
        this.windows.count(`ble:security:event:${event.guildId}:${eventType}`, now, eventWindowMs)
      )
    );
    const actionDiversity = diversityCounts.filter((count) => count > 0).length;
    const trust = await this.persistence.getTrust(
      event.guildId,
      event.actorId,
      context.isGuildOwner
    );
    const maintenance = event.actorId
      ? await this.persistence.getMaintenance(event.guildId, event.actorId, event.occurredAt)
      : undefined;
    const maintenanceAllowsAction = Boolean(
      maintenance &&
      maintenance.expiresAt > event.occurredAt &&
      maintenance.allowedEventTypes.includes(event.eventType)
    );
    const assessment = assessRisk({
      event,
      actorWindowCount,
      guildWindowCount,
      actionDiversity,
      trustLevel: trust,
      ...(context.targetCriticality ? { targetCriticality: context.targetCriticality } : {}),
      hasPermissionEscalation:
        event.eventType === 'ADMINISTRATOR_GRANTED' ||
        event.eventType === 'DANGEROUS_PERMISSION_GRANTED',
      ...(context.isNovelBehavior !== undefined
        ? { isNovelBehavior: context.isNovelBehavior }
        : {}),
      ...(context.coordinatedActorCount !== undefined
        ? { coordinatedActorCount: context.coordinatedActorCount }
        : {}),
      ...(context.accountRisk ? { accountRisk: context.accountRisk } : {}),
      authorizedMaintenance: context.authorizedMaintenance ?? maintenanceAllowsAction,
      thresholds: policy.thresholds
    });

    const canAttribute = Boolean(
      event.actorId && event.correlationConfidence >= policy.thresholds.minimumConfidence
    );
    const ownerProtected = context.isGuildOwner || trust === 'OWNER';
    const maintenanceWithinAllowance = Boolean(
      maintenanceAllowsAction && maintenance && assessment.score <= maintenance.maximumRisk
    );
    const modeAllowsContainment = policy.mode !== 'MONITOR';
    const shouldContain =
      assessment.decision === 'CONTAIN' || assessment.decision === 'EMERGENCY'
        ? canAttribute && !ownerProtected && !maintenanceWithinAllowance && modeAllowsContainment
        : false;
    const shouldLockdown =
      assessment.decision === 'EMERGENCY' &&
      (context.coordinatedActorCount ?? 0) > 1 &&
      modeAllowsContainment;

    const signal = shouldLockdown
      ? 'COORDINATED_ATTACK'
      : shouldContain
        ? 'CONFIRMED_CONTAINMENT'
        : assessment.decision === 'ALERT'
          ? 'ELEVATED_ACTIVITY'
          : undefined;
    const stateTransition = signal ? transition(policy.state, signal) : undefined;
    const state = stateTransition?.to ?? policy.state;
    if (stateTransition) await this.persistence.setState(event.guildId, state);

    let incident =
      assessment.decision === 'OBSERVE'
        ? undefined
        : await this.persistence.latestOpenIncident(event.guildId);
    if (!incident && assessment.decision !== 'OBSERVE') {
      incident = await this.persistence.createIncident({
        guildId: event.guildId,
        state,
        riskScore: assessment.score,
        confidence: event.correlationConfidence,
        event
      });
    }
    if (incident) {
      await this.persistence.addTimeline(
        incident.id,
        'RISK_ASSESSED',
        {
          riskScore: assessment.score,
          decision: assessment.decision,
          actorWindowCount,
          guildWindowCount,
          actionDiversity,
          trust,
          canAttribute,
          maintenanceWithinAllowance
        },
        event.id
      );
      if (stateTransition) {
        await this.persistence.addTimeline(
          incident.id,
          'STATE_TRANSITION',
          stateTransition,
          event.id
        );
      }
    }

    let contained = false;
    if (shouldContain) {
      const operationId = crypto.randomUUID();
      try {
        const actions = await this.containment.contain(event, operationId);
        contained = actions.some((action) => action.success);
        this.metrics.containmentActions.inc({ outcome: contained ? 'success' : 'not_actionable' });
        if (incident)
          await this.persistence.addTimeline(
            incident.id,
            'CONTAINMENT',
            { operationId, actions },
            event.id
          );
      } catch (error) {
        this.metrics.containmentActions.inc({ outcome: 'failed' });
        this.logger.error(
          { guildId: event.guildId, eventId: event.id, err: error },
          'BLE Shield containment failed'
        );
        if (incident) {
          await this.persistence.addTimeline(
            incident.id,
            'CONTAINMENT_FAILED',
            { operationId, reason: error instanceof Error ? error.message : 'Unknown error' },
            event.id
          );
        }
      }
    }

    const explanation = [
      `Risk ${assessment.score} from action, velocity, trust, confidence, and resource factors.`,
      canAttribute
        ? 'Actor correlation met the configured confidence threshold.'
        : 'Actor is unresolved or correlation confidence is insufficient.',
      ownerProtected
        ? 'Guild owner is protected from automated punishment.'
        : 'Actor is eligible for policy review.',
      maintenanceWithinAllowance
        ? 'An active maintenance session reduced response sensitivity.'
        : 'No matching maintenance allowance applies.'
    ];
    return {
      event,
      riskScore: assessment.score,
      decision: assessment.decision,
      state,
      ...(incident ? { incidentPublicId: incident.publicId } : {}),
      contained,
      degraded: state === 'DEGRADED',
      explanation
    };
  }
}
