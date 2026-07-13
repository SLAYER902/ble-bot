import { describe, expect, it } from 'vitest';

import { PLAN_LIMITS, planFromStoredTier } from '../../src/features/premium/plan-limits.js';

describe('BLE plan limits', () => {
  it('keeps core ticket capacity available on the Free plan', () => {
    expect(PLAN_LIMITS.FREE.ticketPanels).toBe(1);
    expect(PLAN_LIMITS.FREE.openTicketsPerUser).toBe(2);
    expect(PLAN_LIMITS.FREE.musicEmptyChannelTimeoutMinutes).toBe(3);
    expect(PLAN_LIMITS.FREE.musicIdleTimeoutMinutes).toBe(5);
  });

  it('maps legacy paid entitlement rows to the compatible Premium plan', () => {
    expect(planFromStoredTier('FREE')).toBe('FREE');
    expect(planFromStoredTier('PRO')).toBe('PREMIUM');
    expect(planFromStoredTier('ENTERPRISE')).toBe('PREMIUM');
  });
});
