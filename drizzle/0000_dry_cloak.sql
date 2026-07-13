CREATE TYPE "public"."backup_status" AS ENUM('PENDING', 'COMPLETE', 'INCOMPLETE', 'DELETED');--> statement-breakpoint
CREATE TYPE "public"."entitlement_tier" AS ENUM('FREE', 'PRO', 'ENTERPRISE');--> statement-breakpoint
CREATE TYPE "public"."incident_status" AS ENUM('OPEN', 'INVESTIGATING', 'CONTAINED', 'RECOVERING', 'RESOLVED', 'FALSE_POSITIVE', 'CLOSED');--> statement-breakpoint
CREATE TYPE "public"."protection_level" AS ENUM('WATCH', 'IMPORTANT', 'CRITICAL', 'IMMUTABLE');--> statement-breakpoint
CREATE TYPE "public"."security_state" AS ENUM('NORMAL', 'ELEVATED', 'CONTAINMENT', 'LOCKDOWN', 'RECOVERY', 'DEGRADED');--> statement-breakpoint
CREATE TYPE "public"."trust_level" AS ENUM('OWNER', 'SECURITY_ADMIN', 'TRUSTED_ADMIN', 'MODERATOR', 'AUTOMATION_BOT', 'STANDARD', 'UNKNOWN', 'BLOCKED');--> statement-breakpoint
CREATE TABLE "ai_credit_balances" (
	"guild_id" varchar(32) PRIMARY KEY NOT NULL,
	"period_start" timestamp with time zone NOT NULL,
	"available" integer NOT NULL,
	"reserved" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_reservations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"guild_id" varchar(32) NOT NULL,
	"user_id" varchar(32) NOT NULL,
	"credits" integer NOT NULL,
	"kind" varchar(32) NOT NULL,
	"status" varchar(16) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"settled_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "ai_usage_ledger" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"guild_id" varchar(32) NOT NULL,
	"user_id" varchar(32) NOT NULL,
	"reservation_id" uuid NOT NULL,
	"credits" integer NOT NULL,
	"kind" varchar(32) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ai_usage_ledger_reservation_id_unique" UNIQUE("reservation_id")
);
--> statement-breakpoint
CREATE TABLE "backups" (
	"id" uuid PRIMARY KEY NOT NULL,
	"guild_id" varchar(32) NOT NULL,
	"created_by" varchar(32) NOT NULL,
	"trigger" varchar(24) NOT NULL,
	"schema_version" integer NOT NULL,
	"checksum" varchar(128) NOT NULL,
	"storage_key" text NOT NULL,
	"encrypted" boolean DEFAULT false NOT NULL,
	"status" "backup_status" DEFAULT 'PENDING' NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "guild_entitlements" (
	"guild_id" varchar(32) PRIMARY KEY NOT NULL,
	"tier" "entitlement_tier" DEFAULT 'FREE' NOT NULL,
	"source" varchar(32) DEFAULT 'default' NOT NULL,
	"expires_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "guild_features" (
	"guild_id" varchar(32) NOT NULL,
	"feature" varchar(96) NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"updated_by" varchar(32),
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "guild_features_guild_id_feature_pk" PRIMARY KEY("guild_id","feature")
);
--> statement-breakpoint
CREATE TABLE "guild_settings" (
	"guild_id" varchar(32) PRIMARY KEY NOT NULL,
	"setup_step" integer DEFAULT 0 NOT NULL,
	"setup_completed" boolean DEFAULT false NOT NULL,
	"security_log_channel_id" varchar(32),
	"moderation_log_channel_id" varchar(32),
	"general_log_channel_id" varchar(32),
	"privacy_retention_days" integer DEFAULT 90 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "guilds" (
	"id" varchar(32) PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "idempotency_records" (
	"key" varchar(160) PRIMARY KEY NOT NULL,
	"scope" varchar(64) NOT NULL,
	"status" varchar(16) NOT NULL,
	"result" jsonb,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "incident_timeline" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"incident_id" uuid NOT NULL,
	"event_id" uuid,
	"kind" varchar(32) NOT NULL,
	"details" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "maintenance_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"guild_id" varchar(32) NOT NULL,
	"actor_id" varchar(32) NOT NULL,
	"reason" text NOT NULL,
	"allowed_actions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"risk_allowance" integer NOT NULL,
	"approved_by" varchar(32) NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"ended_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "moderation_cases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"guild_id" varchar(32) NOT NULL,
	"target_id" varchar(32) NOT NULL,
	"moderator_id" varchar(32) NOT NULL,
	"action" varchar(32) NOT NULL,
	"reason" text NOT NULL,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "protected_resources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"guild_id" varchar(32) NOT NULL,
	"resource_id" varchar(32) NOT NULL,
	"resource_type" varchar(32) NOT NULL,
	"level" "protection_level" NOT NULL,
	"reason" text NOT NULL,
	"created_by" varchar(32) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reminders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"guild_id" varchar(32),
	"user_id" varchar(32) NOT NULL,
	"channel_id" varchar(32),
	"content" text NOT NULL,
	"due_at" timestamp with time zone NOT NULL,
	"delivered_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "security_events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"guild_id" varchar(32) NOT NULL,
	"event_type" varchar(64) NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"received_at" timestamp with time zone NOT NULL,
	"target_id" varchar(32),
	"target_type" varchar(32),
	"actor_id" varchar(32),
	"actor_type" varchar(16),
	"audit_log_entry_id" varchar(32),
	"source" varchar(16) NOT NULL,
	"severity" integer NOT NULL,
	"action_weight" integer NOT NULL,
	"correlation_confidence" integer NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "security_incidents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"public_id" varchar(32) NOT NULL,
	"guild_id" varchar(32) NOT NULL,
	"status" "incident_status" DEFAULT 'OPEN' NOT NULL,
	"security_state" "security_state" NOT NULL,
	"risk_score" integer NOT NULL,
	"confidence" integer NOT NULL,
	"first_event_at" timestamp with time zone NOT NULL,
	"last_event_at" timestamp with time zone NOT NULL,
	"summary" text NOT NULL,
	"resolution" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "security_incidents_public_id_unique" UNIQUE("public_id")
);
--> statement-breakpoint
CREATE TABLE "security_policies" (
	"guild_id" varchar(32) PRIMARY KEY NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"mode" varchar(16) DEFAULT 'BALANCED' NOT NULL,
	"state" "security_state" DEFAULT 'NORMAL' NOT NULL,
	"observe_threshold" integer DEFAULT 40 NOT NULL,
	"contain_threshold" integer DEFAULT 70 NOT NULL,
	"emergency_threshold" integer DEFAULT 100 NOT NULL,
	"minimum_confidence" integer DEFAULT 70 NOT NULL,
	"action_weights" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"configuration" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tickets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"guild_id" varchar(32) NOT NULL,
	"channel_id" varchar(32) NOT NULL,
	"opener_id" varchar(32) NOT NULL,
	"claimed_by" varchar(32),
	"status" varchar(16) DEFAULT 'OPEN' NOT NULL,
	"priority" varchar(16) DEFAULT 'NORMAL' NOT NULL,
	"category" varchar(48) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closed_at" timestamp with time zone,
	CONSTRAINT "tickets_channel_id_unique" UNIQUE("channel_id")
);
--> statement-breakpoint
CREATE TABLE "trusted_actors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"guild_id" varchar(32) NOT NULL,
	"actor_id" varchar(32) NOT NULL,
	"level" "trust_level" NOT NULL,
	"reason" text NOT NULL,
	"created_by" varchar(32) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "ai_credit_balances" ADD CONSTRAINT "ai_credit_balances_guild_id_guilds_id_fk" FOREIGN KEY ("guild_id") REFERENCES "public"."guilds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_reservations" ADD CONSTRAINT "ai_reservations_guild_id_guilds_id_fk" FOREIGN KEY ("guild_id") REFERENCES "public"."guilds"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_usage_ledger" ADD CONSTRAINT "ai_usage_ledger_guild_id_guilds_id_fk" FOREIGN KEY ("guild_id") REFERENCES "public"."guilds"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "backups" ADD CONSTRAINT "backups_guild_id_guilds_id_fk" FOREIGN KEY ("guild_id") REFERENCES "public"."guilds"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guild_entitlements" ADD CONSTRAINT "guild_entitlements_guild_id_guilds_id_fk" FOREIGN KEY ("guild_id") REFERENCES "public"."guilds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guild_features" ADD CONSTRAINT "guild_features_guild_id_guilds_id_fk" FOREIGN KEY ("guild_id") REFERENCES "public"."guilds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guild_settings" ADD CONSTRAINT "guild_settings_guild_id_guilds_id_fk" FOREIGN KEY ("guild_id") REFERENCES "public"."guilds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incident_timeline" ADD CONSTRAINT "incident_timeline_incident_id_security_incidents_id_fk" FOREIGN KEY ("incident_id") REFERENCES "public"."security_incidents"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incident_timeline" ADD CONSTRAINT "incident_timeline_event_id_security_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."security_events"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenance_sessions" ADD CONSTRAINT "maintenance_sessions_guild_id_guilds_id_fk" FOREIGN KEY ("guild_id") REFERENCES "public"."guilds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "moderation_cases" ADD CONSTRAINT "moderation_cases_guild_id_guilds_id_fk" FOREIGN KEY ("guild_id") REFERENCES "public"."guilds"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "protected_resources" ADD CONSTRAINT "protected_resources_guild_id_guilds_id_fk" FOREIGN KEY ("guild_id") REFERENCES "public"."guilds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "security_events" ADD CONSTRAINT "security_events_guild_id_guilds_id_fk" FOREIGN KEY ("guild_id") REFERENCES "public"."guilds"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "security_incidents" ADD CONSTRAINT "security_incidents_guild_id_guilds_id_fk" FOREIGN KEY ("guild_id") REFERENCES "public"."guilds"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "security_policies" ADD CONSTRAINT "security_policies_guild_id_guilds_id_fk" FOREIGN KEY ("guild_id") REFERENCES "public"."guilds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_guild_id_guilds_id_fk" FOREIGN KEY ("guild_id") REFERENCES "public"."guilds"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trusted_actors" ADD CONSTRAINT "trusted_actors_guild_id_guilds_id_fk" FOREIGN KEY ("guild_id") REFERENCES "public"."guilds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ai_reservation_guild_status_idx" ON "ai_reservations" USING btree ("guild_id","status");--> statement-breakpoint
CREATE INDEX "ai_usage_guild_created_idx" ON "ai_usage_ledger" USING btree ("guild_id","created_at");--> statement-breakpoint
CREATE INDEX "backup_guild_created_idx" ON "backups" USING btree ("guild_id","created_at");--> statement-breakpoint
CREATE INDEX "guild_settings_setup_idx" ON "guild_settings" USING btree ("setup_completed");--> statement-breakpoint
CREATE INDEX "idempotency_expiry_idx" ON "idempotency_records" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "incident_timeline_incident_created_idx" ON "incident_timeline" USING btree ("incident_id","created_at");--> statement-breakpoint
CREATE INDEX "maintenance_guild_expiry_idx" ON "maintenance_sessions" USING btree ("guild_id","expires_at");--> statement-breakpoint
CREATE INDEX "moderation_case_guild_target_created_idx" ON "moderation_cases" USING btree ("guild_id","target_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "protected_resource_unique" ON "protected_resources" USING btree ("guild_id","resource_id","resource_type");--> statement-breakpoint
CREATE INDEX "reminder_due_idx" ON "reminders" USING btree ("due_at");--> statement-breakpoint
CREATE INDEX "security_event_guild_occurred_idx" ON "security_events" USING btree ("guild_id","occurred_at");--> statement-breakpoint
CREATE INDEX "security_event_guild_actor_occurred_idx" ON "security_events" USING btree ("guild_id","actor_id","occurred_at");--> statement-breakpoint
CREATE INDEX "security_incident_guild_created_idx" ON "security_incidents" USING btree ("guild_id","created_at");--> statement-breakpoint
CREATE INDEX "ticket_guild_status_idx" ON "tickets" USING btree ("guild_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "trusted_actor_guild_actor_unique" ON "trusted_actors" USING btree ("guild_id","actor_id");