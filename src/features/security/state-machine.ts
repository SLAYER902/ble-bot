import type { SecurityState } from './types.js';

export type SecuritySignal =
  | 'ELEVATED_ACTIVITY'
  | 'CONFIRMED_CONTAINMENT'
  | 'COORDINATED_ATTACK'
  | 'ACTIVITY_STOPPED'
  | 'RECOVERY_VERIFIED'
  | 'DEPENDENCY_FAILURE'
  | 'CIRCUIT_OPEN'
  | 'MANUAL_LOCKDOWN'
  | 'MANUAL_UNLOCK';

export type StateTransition = Readonly<{
  from: SecurityState;
  to: SecurityState;
  reason: string;
}>;

export const transition = (
  from: SecurityState,
  signal: SecuritySignal
): StateTransition | undefined => {
  if (signal === 'DEPENDENCY_FAILURE' || signal === 'CIRCUIT_OPEN') {
    return {
      from,
      to: 'DEGRADED',
      reason: 'A required BLE Shield safety dependency is unavailable.'
    };
  }
  if (signal === 'MANUAL_LOCKDOWN')
    return { from, to: 'LOCKDOWN', reason: 'A trusted responder initiated lockdown.' };
  if (signal === 'MANUAL_UNLOCK' && from === 'LOCKDOWN') {
    return {
      from,
      to: 'RECOVERY',
      reason: 'Lockdown was lifted; recovery verification is required.'
    };
  }
  switch (from) {
    case 'NORMAL':
      return signal === 'ELEVATED_ACTIVITY'
        ? { from, to: 'ELEVATED', reason: 'Repeated elevated-risk activity was detected.' }
        : undefined;
    case 'ELEVATED':
      if (signal === 'CONFIRMED_CONTAINMENT')
        return {
          from,
          to: 'CONTAINMENT',
          reason: 'A confirmed actor exceeded containment policy.'
        };
      if (signal === 'COORDINATED_ATTACK')
        return { from, to: 'LOCKDOWN', reason: 'Coordinated destructive activity was detected.' };
      return undefined;
    case 'CONTAINMENT':
      if (signal === 'COORDINATED_ATTACK')
        return { from, to: 'LOCKDOWN', reason: 'Containment escalated to a coordinated attack.' };
      if (signal === 'ACTIVITY_STOPPED')
        return {
          from,
          to: 'RECOVERY',
          reason: 'Destructive activity stopped; recovery can begin.'
        };
      return undefined;
    case 'LOCKDOWN':
      return signal === 'ACTIVITY_STOPPED'
        ? { from, to: 'RECOVERY', reason: 'Attack activity stopped and recovery was authorized.' }
        : undefined;
    case 'RECOVERY':
      return signal === 'RECOVERY_VERIFIED'
        ? { from, to: 'NORMAL', reason: 'Recovery and safety checks completed.' }
        : undefined;
    case 'DEGRADED':
      return undefined;
  }
};
