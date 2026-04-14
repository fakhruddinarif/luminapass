CREATE TYPE "public"."event_status" AS ENUM('draft', 'published', 'on_sale', 'sold_out', 'live', 'finished', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."order_status" AS ENUM('queued', 'processing', 'reserved', 'awaiting_payment', 'paid', 'failed', 'cancelled', 'expired');--> statement-breakpoint
CREATE TYPE "public"."payment_status" AS ENUM('pending', 'authorized', 'captured', 'failed', 'expired', 'refunded', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."queue_status" AS ENUM('queued', 'processing', 'completed', 'failed', 'dead_letter');--> statement-breakpoint
CREATE TYPE "public"."stock_movement_type" AS ENUM('reserve', 'release', 'sale', 'refund', 'admin_add', 'admin_withdraw', 'sync_adjustment');--> statement-breakpoint
CREATE TYPE "public"."stream_resolution" AS ENUM('1080p', '720p', '480p');--> statement-breakpoint
CREATE TYPE "public"."stream_session_status" AS ENUM('started', 'playing', 'paused', 'ended');--> statement-breakpoint
CREATE TABLE "events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" varchar(180) NOT NULL,
	"name" varchar(200) NOT NULL,
	"description" text,
	"venue_name" varchar(200) NOT NULL,
	"venue_city" varchar(120) NOT NULL,
	"venue_address" text,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone,
	"sale_starts_at" timestamp with time zone NOT NULL,
	"sale_ends_at" timestamp with time zone,
	"status" "event_status" DEFAULT 'draft' NOT NULL,
	"cover_image_url" text,
	"livestream_enabled" boolean DEFAULT false NOT NULL,
	"created_by" uuid NOT NULL,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "event_sections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"code" varchar(40) NOT NULL,
	"name" varchar(120) NOT NULL,
	"description" text,
	"price" numeric(10, 2) DEFAULT '0' NOT NULL,
	"capacity" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ticket_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_code" varchar(64) NOT NULL,
	"event_id" uuid NOT NULL,
	"user_id" uuid,
	"idempotency_key" varchar(128) NOT NULL,
	"status" "order_status" DEFAULT 'queued' NOT NULL,
	"subtotal_amount" numeric(12, 2) DEFAULT '0' NOT NULL,
	"total_amount" numeric(12, 2) DEFAULT '0' NOT NULL,
	"queue_token" varchar(128),
	"payment_provider" varchar(64) DEFAULT 'mock' NOT NULL,
	"payment_reference" varchar(128),
	"expires_at" timestamp with time zone,
	"paid_at" timestamp with time zone,
	"failed_reason" text,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ticket_orders_order_code_unique" UNIQUE("order_code"),
	CONSTRAINT "ticket_orders_idempotency_key_unique" UNIQUE("idempotency_key")
);
--> statement-breakpoint
CREATE TABLE "ticket_order_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"event_section_id" uuid NOT NULL,
	"section_code" varchar(40) NOT NULL,
	"section_name" varchar(120) NOT NULL,
	"unit_price" numeric(12, 2) DEFAULT '0' NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"line_total" numeric(12, 2) DEFAULT '0' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment_transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"provider" varchar(64) DEFAULT 'mock' NOT NULL,
	"external_txn_id" varchar(128),
	"provider_order_id" varchar(128),
	"idempotency_key" varchar(128) NOT NULL,
	"amount" numeric(12, 2) DEFAULT '0' NOT NULL,
	"status" "payment_status" DEFAULT 'pending' NOT NULL,
	"raw_provider_status" varchar(64),
	"payment_type" varchar(64),
	"channel_code" varchar(64),
	"fraud_status" varchar(32),
	"status_message" text,
	"webhook_event_id" varchar(128),
	"webhook_signature_valid" boolean DEFAULT false NOT NULL,
	"webhook_received_at" timestamp with time zone,
	"simulator_code" varchar(16),
	"failure_reason" text,
	"provider_request_payload" jsonb,
	"provider_response_payload" jsonb,
	"webhook_payload" jsonb,
	"charged_at" timestamp with time zone,
	"settled_at" timestamp with time zone,
	"expired_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"refunded_at" timestamp with time zone,
	"processed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payment_transactions_idempotency_key_unique" UNIQUE("idempotency_key")
);
--> statement-breakpoint
CREATE TABLE "waiting_room_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"user_id" uuid,
	"queue_token" varchar(128) NOT NULL,
	"message_id" varchar(128),
	"status" "queue_status" DEFAULT 'queued' NOT NULL,
	"priority" integer DEFAULT 0 NOT NULL,
	"retry_count" integer DEFAULT 0 NOT NULL,
	"payload" jsonb,
	"queued_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "waiting_room_jobs_queue_token_unique" UNIQUE("queue_token")
);
--> statement-breakpoint
CREATE TABLE "stock_movements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_section_id" uuid NOT NULL,
	"order_id" uuid,
	"actor_user_id" uuid,
	"movement_type" "stock_movement_type" NOT NULL,
	"quantity" integer NOT NULL,
	"stock_before" integer NOT NULL,
	"stock_after" integer NOT NULL,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "livestream_variants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"resolution" "stream_resolution" NOT NULL,
	"width" integer NOT NULL,
	"height" integer NOT NULL,
	"bitrate_kbps" integer NOT NULL,
	"playlist_url" text NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stream_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"user_id" uuid,
	"session_token" varchar(128) NOT NULL,
	"ip_address" varchar(64),
	"user_agent" varchar(512),
	"status" "stream_session_status" DEFAULT 'started' NOT NULL,
	"current_resolution" "stream_resolution" DEFAULT '720p' NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "stream_sessions_session_token_unique" UNIQUE("session_token")
);
--> statement-breakpoint
CREATE TABLE "stream_quality_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"stream_session_id" uuid NOT NULL,
	"from_resolution" "stream_resolution",
	"to_resolution" "stream_resolution" NOT NULL,
	"observed_bandwidth_kbps" integer,
	"buffer_health_ms" integer,
	"switched_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_sections" ADD CONSTRAINT "event_sections_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_orders" ADD CONSTRAINT "ticket_orders_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_orders" ADD CONSTRAINT "ticket_orders_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_order_items" ADD CONSTRAINT "ticket_order_items_order_id_ticket_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."ticket_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_order_items" ADD CONSTRAINT "ticket_order_items_event_section_id_event_sections_id_fk" FOREIGN KEY ("event_section_id") REFERENCES "public"."event_sections"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_transactions" ADD CONSTRAINT "payment_transactions_order_id_ticket_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."ticket_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "waiting_room_jobs" ADD CONSTRAINT "waiting_room_jobs_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "waiting_room_jobs" ADD CONSTRAINT "waiting_room_jobs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_event_section_id_event_sections_id_fk" FOREIGN KEY ("event_section_id") REFERENCES "public"."event_sections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_order_id_ticket_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."ticket_orders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "livestream_variants" ADD CONSTRAINT "livestream_variants_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stream_sessions" ADD CONSTRAINT "stream_sessions_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stream_sessions" ADD CONSTRAINT "stream_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stream_quality_events" ADD CONSTRAINT "stream_quality_events_stream_session_id_stream_sessions_id_fk" FOREIGN KEY ("stream_session_id") REFERENCES "public"."stream_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "events_slug_unique_idx" ON "events" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "events_status_idx" ON "events" USING btree ("status");--> statement-breakpoint
CREATE INDEX "events_starts_at_idx" ON "events" USING btree ("starts_at");--> statement-breakpoint
CREATE INDEX "events_created_by_idx" ON "events" USING btree ("created_by");--> statement-breakpoint
CREATE UNIQUE INDEX "event_sections_event_code_unique_idx" ON "event_sections" USING btree ("event_id","code");--> statement-breakpoint
CREATE INDEX "ticket_orders_event_status_idx" ON "ticket_orders" USING btree ("event_id","status");--> statement-breakpoint
CREATE INDEX "ticket_orders_user_status_idx" ON "ticket_orders" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "ticket_orders_created_at_idx" ON "ticket_orders" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "ticket_order_items_order_idx" ON "ticket_order_items" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "ticket_order_items_event_section_idx" ON "ticket_order_items" USING btree ("event_section_id");--> statement-breakpoint
CREATE INDEX "payment_transactions_order_status_idx" ON "payment_transactions" USING btree ("order_id","status");--> statement-breakpoint
CREATE INDEX "payment_transactions_provider_idx" ON "payment_transactions" USING btree ("provider");--> statement-breakpoint
CREATE INDEX "payment_transactions_external_txn_idx" ON "payment_transactions" USING btree ("external_txn_id");--> statement-breakpoint
CREATE INDEX "payment_transactions_webhook_event_idx" ON "payment_transactions" USING btree ("provider","webhook_event_id");--> statement-breakpoint
CREATE INDEX "payment_transactions_created_at_idx" ON "payment_transactions" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "waiting_room_jobs_event_status_idx" ON "waiting_room_jobs" USING btree ("event_id","status");--> statement-breakpoint
CREATE INDEX "waiting_room_jobs_user_status_idx" ON "waiting_room_jobs" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "waiting_room_jobs_queued_at_idx" ON "waiting_room_jobs" USING btree ("queued_at");--> statement-breakpoint
CREATE INDEX "stock_movements_section_created_at_idx" ON "stock_movements" USING btree ("event_section_id","created_at");--> statement-breakpoint
CREATE INDEX "stock_movements_movement_type_idx" ON "stock_movements" USING btree ("movement_type");--> statement-breakpoint
CREATE INDEX "stock_movements_order_idx" ON "stock_movements" USING btree ("order_id");--> statement-breakpoint
CREATE UNIQUE INDEX "livestream_variants_event_resolution_unique_idx" ON "livestream_variants" USING btree ("event_id","resolution");--> statement-breakpoint
CREATE INDEX "livestream_variants_event_default_idx" ON "livestream_variants" USING btree ("event_id","is_default");--> statement-breakpoint
CREATE INDEX "stream_sessions_event_status_idx" ON "stream_sessions" USING btree ("event_id","status");--> statement-breakpoint
CREATE INDEX "stream_sessions_user_status_idx" ON "stream_sessions" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "stream_sessions_started_at_idx" ON "stream_sessions" USING btree ("started_at");--> statement-breakpoint
CREATE INDEX "stream_quality_events_session_switched_at_idx" ON "stream_quality_events" USING btree ("stream_session_id","switched_at");