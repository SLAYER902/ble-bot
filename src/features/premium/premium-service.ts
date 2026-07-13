import { eq } from 'drizzle-orm';

import type { Database } from '../../infrastructure/database/database.js';
import { guildEntitlements } from '../../infrastructure/database/schema.js';
import { PLAN_LIMITS, planFromStoredTier, type BlePlan, type PlanLimits } from './plan-limits.js';

export type PremiumStatus = Readonly<{
  plan: BlePlan;
  source: string;
  expiresAt?: Date;
  limits: PlanLimits;
}>;

export class PremiumService {
  public constructor(private readonly database: Database) {}

  public async status(guildId: string): Promise<PremiumStatus> {
    const entitlement = await this.database.db.query.guildEntitlements.findFirst({
      where: eq(guildEntitlements.guildId, guildId)
    });
    if (!entitlement || (entitlement.expiresAt && entitlement.expiresAt <= new Date())) {
      return { plan: 'FREE', source: entitlement?.source ?? 'default', limits: PLAN_LIMITS.FREE };
    }
    const plan = planFromStoredTier(entitlement.tier);
    return {
      plan,
      source: entitlement.source,
      ...(entitlement.expiresAt ? { expiresAt: entitlement.expiresAt } : {}),
      limits: PLAN_LIMITS[plan]
    };
  }
}
