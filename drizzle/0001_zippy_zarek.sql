CREATE TABLE "ticket_panels" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"guild_id" varchar(32) NOT NULL,
	"name" varchar(80) NOT NULL,
	"description" text NOT NULL,
	"target_channel_id" varchar(32),
	"category_id" varchar(32),
	"message_id" varchar(32),
	"staff_role_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"max_open_per_user" integer DEFAULT 2 NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_by" varchar(32) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ticket_participants" (
	"ticket_id" uuid NOT NULL,
	"user_id" varchar(32) NOT NULL,
	"added_by" varchar(32) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ticket_participants_ticket_id_user_id_pk" PRIMARY KEY("ticket_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "ticket_timeline_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ticket_id" uuid NOT NULL,
	"actor_id" varchar(32),
	"kind" varchar(48) NOT NULL,
	"details" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tickets" ADD COLUMN "panel_id" uuid;--> statement-breakpoint
ALTER TABLE "tickets" ADD COLUMN "subject" varchar(120) DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "tickets" ADD COLUMN "details" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "tickets" ADD COLUMN "control_message_id" varchar(32);--> statement-breakpoint
ALTER TABLE "tickets" ADD COLUMN "closed_by" varchar(32);--> statement-breakpoint
ALTER TABLE "tickets" ADD COLUMN "closed_reason" text;--> statement-breakpoint
ALTER TABLE "ticket_panels" ADD CONSTRAINT "ticket_panels_guild_id_guilds_id_fk" FOREIGN KEY ("guild_id") REFERENCES "public"."guilds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_participants" ADD CONSTRAINT "ticket_participants_ticket_id_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_timeline_events" ADD CONSTRAINT "ticket_timeline_events_ticket_id_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ticket_panel_guild_created_idx" ON "ticket_panels" USING btree ("guild_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "ticket_panel_message_unique" ON "ticket_panels" USING btree ("message_id");--> statement-breakpoint
CREATE INDEX "ticket_timeline_ticket_created_idx" ON "ticket_timeline_events" USING btree ("ticket_id","created_at");--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_panel_id_ticket_panels_id_fk" FOREIGN KEY ("panel_id") REFERENCES "public"."ticket_panels"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ticket_panel_status_idx" ON "tickets" USING btree ("panel_id","status");