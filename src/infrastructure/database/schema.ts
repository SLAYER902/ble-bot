import { relations } from 'drizzle-orm';
import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar
} from 'drizzle-orm/pg-core';

export const securityStateEnum = pgEnum('security_state', [
  'NORMAL',
  'ELEVATED',
  'CONTAINMENT',
  'LOCKDOWN',
  'RECOVERY',
  'DEGRADED'
]);
export const trustLevelEnum = pgEnum('trust_level', [
  'OWNER',
  'SECURITY_ADMIN',
  'TRUSTED_ADMIN',
  'MODERATOR',
  'AUTOMATION_BOT',
  'STANDARD',
  'UNKNOWN',
  'BLOCKED'
]);
export const incidentStatusEnum = pgEnum('incident_status', [
  'OPEN',
  'INVESTIGATING',
  'CONTAINED',
  'RECOVERING',
  'RESOLVED',
  'FALSE_POSITIVE',
  'CLOSED'
]);
export const protectionLevelEnum = pgEnum('protection_level', [
  'WATCH',
  'IMPORTANT',
  'CRITICAL',
  'IMMUTABLE'
]);
export const entitlementTierEnum = pgEnum('entitlement_tier', ['FREE', 'PRO', 'ENTERPRISE']);
export const backupStatusEnum = pgEnum('backup_status', [
  'PENDING',
  'COMPLETE',
  'INCOMPLETE',
  'DELETED'
]);

export const guilds = pgTable('guilds', {
  id: varchar('id', { length: 32 }).primaryKey(),
  name: text('name').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
});

export const guildSettings = pgTable(
  'guild_settings',
  {
    guildId: varchar('guild_id', { length: 32 })
      .primaryKey()
      .references(() => guilds.id, { onDelete: 'cascade' }),
    setupStep: integer('setup_step').notNull().default(0),
    setupCompleted: boolean('setup_completed').notNull().default(false),
    securityLogChannelId: varchar('security_log_channel_id', { length: 32 }),
    moderationLogChannelId: varchar('moderation_log_channel_id', { length: 32 }),
    generalLogChannelId: varchar('general_log_channel_id', { length: 32 }),
    privacyRetentionDays: integer('privacy_retention_days').notNull().default(90),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [index('guild_settings_setup_idx').on(table.setupCompleted)]
);

export const guildFeatures = pgTable(
  'guild_features',
  {
    guildId: varchar('guild_id', { length: 32 })
      .notNull()
      .references(() => guilds.id, { onDelete: 'cascade' }),
    feature: varchar('feature', { length: 96 }).notNull(),
    enabled: boolean('enabled').notNull().default(false),
    updatedBy: varchar('updated_by', { length: 32 }),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [primaryKey({ columns: [table.guildId, table.feature] })]
);

export const securityPolicies = pgTable('security_policies', {
  guildId: varchar('guild_id', { length: 32 })
    .primaryKey()
    .references(() => guilds.id, { onDelete: 'cascade' }),
  enabled: boolean('enabled').notNull().default(true),
  mode: varchar('mode', { length: 16 }).notNull().default('BALANCED'),
  state: securityStateEnum('state').notNull().default('NORMAL'),
  observeThreshold: integer('observe_threshold').notNull().default(40),
  containThreshold: integer('contain_threshold').notNull().default(70),
  emergencyThreshold: integer('emergency_threshold').notNull().default(100),
  minimumConfidence: integer('minimum_confidence').notNull().default(70),
  actionWeights: jsonb('action_weights').notNull().default({}),
  configuration: jsonb('configuration').notNull().default({}),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
});

export const trustedActors = pgTable(
  'trusted_actors',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    guildId: varchar('guild_id', { length: 32 })
      .notNull()
      .references(() => guilds.id, { onDelete: 'cascade' }),
    actorId: varchar('actor_id', { length: 32 }).notNull(),
    level: trustLevelEnum('level').notNull(),
    reason: text('reason').notNull(),
    createdBy: varchar('created_by', { length: 32 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true })
  },
  (table) => [uniqueIndex('trusted_actor_guild_actor_unique').on(table.guildId, table.actorId)]
);

export const protectedResources = pgTable(
  'protected_resources',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    guildId: varchar('guild_id', { length: 32 })
      .notNull()
      .references(() => guilds.id, { onDelete: 'cascade' }),
    resourceId: varchar('resource_id', { length: 32 }).notNull(),
    resourceType: varchar('resource_type', { length: 32 }).notNull(),
    level: protectionLevelEnum('level').notNull(),
    reason: text('reason').notNull(),
    createdBy: varchar('created_by', { length: 32 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    uniqueIndex('protected_resource_unique').on(table.guildId, table.resourceId, table.resourceType)
  ]
);

export const securityEvents = pgTable(
  'security_events',
  {
    id: uuid('id').primaryKey(),
    guildId: varchar('guild_id', { length: 32 })
      .notNull()
      .references(() => guilds.id, { onDelete: 'restrict' }),
    eventType: varchar('event_type', { length: 64 }).notNull(),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
    receivedAt: timestamp('received_at', { withTimezone: true }).notNull(),
    targetId: varchar('target_id', { length: 32 }),
    targetType: varchar('target_type', { length: 32 }),
    actorId: varchar('actor_id', { length: 32 }),
    actorType: varchar('actor_type', { length: 16 }),
    auditLogEntryId: varchar('audit_log_entry_id', { length: 32 }),
    source: varchar('source', { length: 16 }).notNull(),
    severity: integer('severity').notNull(),
    actionWeight: integer('action_weight').notNull(),
    correlationConfidence: integer('correlation_confidence').notNull(),
    metadata: jsonb('metadata').notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    index('security_event_guild_occurred_idx').on(table.guildId, table.occurredAt),
    index('security_event_guild_actor_occurred_idx').on(
      table.guildId,
      table.actorId,
      table.occurredAt
    )
  ]
);

export const securityIncidents = pgTable(
  'security_incidents',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    publicId: varchar('public_id', { length: 32 }).notNull().unique(),
    guildId: varchar('guild_id', { length: 32 })
      .notNull()
      .references(() => guilds.id, { onDelete: 'restrict' }),
    status: incidentStatusEnum('status').notNull().default('OPEN'),
    securityState: securityStateEnum('security_state').notNull(),
    riskScore: integer('risk_score').notNull(),
    confidence: integer('confidence').notNull(),
    firstEventAt: timestamp('first_event_at', { withTimezone: true }).notNull(),
    lastEventAt: timestamp('last_event_at', { withTimezone: true }).notNull(),
    summary: text('summary').notNull(),
    resolution: text('resolution'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [index('security_incident_guild_created_idx').on(table.guildId, table.createdAt)]
);

export const incidentTimeline = pgTable(
  'incident_timeline',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    incidentId: uuid('incident_id')
      .notNull()
      .references(() => securityIncidents.id, { onDelete: 'restrict' }),
    eventId: uuid('event_id').references(() => securityEvents.id, { onDelete: 'set null' }),
    kind: varchar('kind', { length: 32 }).notNull(),
    details: jsonb('details').notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [index('incident_timeline_incident_created_idx').on(table.incidentId, table.createdAt)]
);

export const maintenanceSessions = pgTable(
  'maintenance_sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    guildId: varchar('guild_id', { length: 32 })
      .notNull()
      .references(() => guilds.id, { onDelete: 'cascade' }),
    actorId: varchar('actor_id', { length: 32 }).notNull(),
    reason: text('reason').notNull(),
    allowedActions: jsonb('allowed_actions').notNull().default([]),
    riskAllowance: integer('risk_allowance').notNull(),
    approvedBy: varchar('approved_by', { length: 32 }).notNull(),
    startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    endedAt: timestamp('ended_at', { withTimezone: true })
  },
  (table) => [index('maintenance_guild_expiry_idx').on(table.guildId, table.expiresAt)]
);

export const idempotencyRecords = pgTable(
  'idempotency_records',
  {
    key: varchar('key', { length: 160 }).primaryKey(),
    scope: varchar('scope', { length: 64 }).notNull(),
    status: varchar('status', { length: 16 }).notNull(),
    result: jsonb('result'),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [index('idempotency_expiry_idx').on(table.expiresAt)]
);

export const backups = pgTable(
  'backups',
  {
    id: uuid('id').primaryKey(),
    guildId: varchar('guild_id', { length: 32 })
      .notNull()
      .references(() => guilds.id, { onDelete: 'restrict' }),
    createdBy: varchar('created_by', { length: 32 }).notNull(),
    trigger: varchar('trigger', { length: 24 }).notNull(),
    schemaVersion: integer('schema_version').notNull(),
    checksum: varchar('checksum', { length: 128 }).notNull(),
    storageKey: text('storage_key').notNull(),
    encrypted: boolean('encrypted').notNull().default(false),
    status: backupStatusEnum('status').notNull().default('PENDING'),
    metadata: jsonb('metadata').notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true })
  },
  (table) => [index('backup_guild_created_idx').on(table.guildId, table.createdAt)]
);

export const moderationCases = pgTable(
  'moderation_cases',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    guildId: varchar('guild_id', { length: 32 })
      .notNull()
      .references(() => guilds.id, { onDelete: 'restrict' }),
    targetId: varchar('target_id', { length: 32 }).notNull(),
    moderatorId: varchar('moderator_id', { length: 32 }).notNull(),
    action: varchar('action', { length: 32 }).notNull(),
    reason: text('reason').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    revokedAt: timestamp('revoked_at', { withTimezone: true })
  },
  (table) => [
    index('moderation_case_guild_target_created_idx').on(
      table.guildId,
      table.targetId,
      table.createdAt
    )
  ]
);

export const ticketPanels = pgTable(
  'ticket_panels',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    guildId: varchar('guild_id', { length: 32 })
      .notNull()
      .references(() => guilds.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 80 }).notNull(),
    description: text('description').notNull(),
    targetChannelId: varchar('target_channel_id', { length: 32 }),
    categoryId: varchar('category_id', { length: 32 }),
    messageId: varchar('message_id', { length: 32 }),
    staffRoleIds: jsonb('staff_role_ids').notNull().default([]),
    maxOpenPerUser: integer('max_open_per_user').notNull().default(2),
    enabled: boolean('enabled').notNull().default(true),
    createdBy: varchar('created_by', { length: 32 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    index('ticket_panel_guild_created_idx').on(table.guildId, table.createdAt),
    uniqueIndex('ticket_panel_message_unique').on(table.messageId)
  ]
);

export const tickets = pgTable(
  'tickets',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    guildId: varchar('guild_id', { length: 32 })
      .notNull()
      .references(() => guilds.id, { onDelete: 'restrict' }),
    channelId: varchar('channel_id', { length: 32 }).notNull().unique(),
    openerId: varchar('opener_id', { length: 32 }).notNull(),
    panelId: uuid('panel_id').references(() => ticketPanels.id, { onDelete: 'set null' }),
    subject: varchar('subject', { length: 120 }).notNull().default(''),
    details: text('details').notNull().default(''),
    controlMessageId: varchar('control_message_id', { length: 32 }),
    claimedBy: varchar('claimed_by', { length: 32 }),
    status: varchar('status', { length: 16 }).notNull().default('OPEN'),
    priority: varchar('priority', { length: 16 }).notNull().default('NORMAL'),
    category: varchar('category', { length: 48 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    closedAt: timestamp('closed_at', { withTimezone: true }),
    closedBy: varchar('closed_by', { length: 32 }),
    closedReason: text('closed_reason')
  },
  (table) => [
    index('ticket_guild_status_idx').on(table.guildId, table.status),
    index('ticket_panel_status_idx').on(table.panelId, table.status)
  ]
);

export const ticketParticipants = pgTable(
  'ticket_participants',
  {
    ticketId: uuid('ticket_id')
      .notNull()
      .references(() => tickets.id, { onDelete: 'cascade' }),
    userId: varchar('user_id', { length: 32 }).notNull(),
    addedBy: varchar('added_by', { length: 32 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [primaryKey({ columns: [table.ticketId, table.userId] })]
);

export const ticketTimelineEvents = pgTable(
  'ticket_timeline_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ticketId: uuid('ticket_id')
      .notNull()
      .references(() => tickets.id, { onDelete: 'cascade' }),
    actorId: varchar('actor_id', { length: 32 }),
    kind: varchar('kind', { length: 48 }).notNull(),
    details: jsonb('details').notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [index('ticket_timeline_ticket_created_idx').on(table.ticketId, table.createdAt)]
);

export const reminders = pgTable(
  'reminders',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    guildId: varchar('guild_id', { length: 32 }),
    userId: varchar('user_id', { length: 32 }).notNull(),
    channelId: varchar('channel_id', { length: 32 }),
    content: text('content').notNull(),
    dueAt: timestamp('due_at', { withTimezone: true }).notNull(),
    deliveredAt: timestamp('delivered_at', { withTimezone: true }),
    cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [index('reminder_due_idx').on(table.dueAt)]
);

export const aiCreditBalances = pgTable('ai_credit_balances', {
  guildId: varchar('guild_id', { length: 32 })
    .primaryKey()
    .references(() => guilds.id, { onDelete: 'cascade' }),
  periodStart: timestamp('period_start', { withTimezone: true }).notNull(),
  available: integer('available').notNull(),
  reserved: integer('reserved').notNull().default(0),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
});

export const aiUsageLedger = pgTable(
  'ai_usage_ledger',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    guildId: varchar('guild_id', { length: 32 })
      .notNull()
      .references(() => guilds.id, { onDelete: 'restrict' }),
    userId: varchar('user_id', { length: 32 }).notNull(),
    reservationId: uuid('reservation_id').notNull().unique(),
    credits: integer('credits').notNull(),
    kind: varchar('kind', { length: 32 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [index('ai_usage_guild_created_idx').on(table.guildId, table.createdAt)]
);

export const aiReservations = pgTable(
  'ai_reservations',
  {
    id: uuid('id').primaryKey(),
    guildId: varchar('guild_id', { length: 32 })
      .notNull()
      .references(() => guilds.id, { onDelete: 'restrict' }),
    userId: varchar('user_id', { length: 32 }).notNull(),
    credits: integer('credits').notNull(),
    kind: varchar('kind', { length: 32 }).notNull(),
    status: varchar('status', { length: 16 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    settledAt: timestamp('settled_at', { withTimezone: true })
  },
  (table) => [index('ai_reservation_guild_status_idx').on(table.guildId, table.status)]
);

export const guildEntitlements = pgTable('guild_entitlements', {
  guildId: varchar('guild_id', { length: 32 })
    .primaryKey()
    .references(() => guilds.id, { onDelete: 'cascade' }),
  tier: entitlementTierEnum('tier').notNull().default('FREE'),
  source: varchar('source', { length: 32 }).notNull().default('default'),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
});

export const guildRelations = relations(guilds, ({ one, many }) => ({
  settings: one(guildSettings),
  policy: one(securityPolicies),
  securityEvents: many(securityEvents),
  incidents: many(securityIncidents),
  backups: many(backups)
}));
