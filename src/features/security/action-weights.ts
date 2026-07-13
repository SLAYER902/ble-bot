import type { SecurityEventType } from './types.js';

export const defaultActionWeights: Readonly<Record<SecurityEventType, number>> = {
  CHANNEL_CREATED: 6,
  CHANNEL_DELETED: 35,
  CHANNEL_UPDATED: 12,
  CATEGORY_CREATED: 6,
  CATEGORY_DELETED: 50,
  CATEGORY_UPDATED: 12,
  ROLE_CREATED: 8,
  ROLE_DELETED: 45,
  ROLE_UPDATED: 18,
  ADMINISTRATOR_GRANTED: 100,
  DANGEROUS_PERMISSION_GRANTED: 65,
  ROLE_HIERARCHY_CHANGED: 35,
  MEMBER_BANNED: 8,
  MEMBER_KICKED: 8,
  MASS_TIMEOUT: 25,
  WEBHOOK_CREATED: 20,
  WEBHOOK_UPDATED: 15,
  WEBHOOK_DELETED: 10,
  BOT_ADDED: 40,
  INTEGRATION_CREATED: 30,
  INTEGRATION_DELETED: 20,
  GUILD_UPDATED: 20,
  AUTOMOD_DELETED: 60,
  AUTOMOD_UPDATED: 25,
  EMOJI_DELETED: 15,
  STICKER_DELETED: 15,
  PERMISSION_OVERWRITE_UPDATED: 12,
  BOT_ROLE_MODIFIED: 100,
  BOT_PERMISSION_REMOVED: 100,
  PROTECTED_RESOURCE_MODIFIED: 90,
  CANARY_MODIFIED: 100
};

export const weightFor = (
  eventType: SecurityEventType,
  overrides: Readonly<Record<string, number>> = {}
): number => {
  const override = overrides[eventType];
  return typeof override === 'number' && Number.isFinite(override) && override >= 0
    ? override
    : defaultActionWeights[eventType];
};
