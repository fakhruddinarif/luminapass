CREATE TYPE "public"."dashboard_scope" AS ENUM('global', 'event');--> statement-breakpoint
CREATE TYPE "public"."event_status" AS ENUM('draft', 'published', 'on_sale', 'sold_out', 'live', 'finished', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."generation_job_status" AS ENUM('queued', 'running', 'completed', 'failed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."log_level" AS ENUM('debug', 'info', 'warn', 'error', 'fatal');--> statement-breakpoint
CREATE TYPE "public"."order_item_status" AS ENUM('reserved', 'sold', 'released');--> statement-breakpoint
CREATE TYPE "public"."order_status" AS ENUM('pending_payment', 'awaiting_confirmation', 'paid', 'expired', 'cancelled', 'refunded');--> statement-breakpoint
CREATE TYPE "public"."payment_status" AS ENUM('pending', 'processing', 'paid', 'failed', 'expired', 'refunded', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."queue_entry_status" AS ENUM('waiting', 'allowed', 'entered', 'expired', 'rejected', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."seat_status" AS ENUM('available', 'reserved', 'sold', 'blocked', 'disabled');--> statement-breakpoint
CREATE TYPE "public"."section_status" AS ENUM('active', 'inactive');--> statement-breakpoint
CREATE TYPE "public"."stream_quality" AS ENUM('1080p', '720p', '480p');--> statement-breakpoint
CREATE TYPE "public"."stream_status" AS ENUM('scheduled', 'ingesting', 'live', 'paused', 'ended', 'failed');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('customer', 'admin');--> statement-breakpoint
CREATE TYPE "public"."user_status" AS ENUM('active', 'suspended', 'deleted');--> statement-breakpoint
CREATE TYPE "public"."viewer_session_status" AS ENUM('active', 'idle', 'ended', 'kicked');--> statement-breakpoint
CREATE TABLE "dashboard_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scope" "dashboard_scope" DEFAULT 'global' NOT NULL,
	"event_id" uuid,
	"ticket_sales_count" integer DEFAULT 0 NOT NULL,
	"seats_available_count" integer DEFAULT 0 NOT NULL,
	"queue_length" integer DEFAULT 0 NOT NULL,
	"active_viewers_count" integer DEFAULT 0 NOT NULL,
	"stream_healthy_count" integer DEFAULT 0 NOT NULL,
	"revenue_cents" integer DEFAULT 0 NOT NULL,
	"error_count" integer DEFAULT 0 NOT NULL,
	"payload" jsonb,
	"snapshot_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "event_sections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"code" varchar(40) NOT NULL,
	"name" varchar(120) NOT NULL,
	"description" text,
	"color" varchar(16),
	"price_cents" integer NOT NULL,
	"currency" varchar(3) DEFAULT 'IDR' NOT NULL,
	"seat_capacity" integer NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"status" "section_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" varchar(180) NOT NULL,
	"name" varchar(200) NOT NULL,
	"description" text,
	"venue_name" varchar(200) NOT NULL,
	"venue_city" varchar(120) NOT NULL,
	"venue_address" text,
	"timezone" varchar(80) DEFAULT 'Asia/Jakarta' NOT NULL,
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
CREATE TABLE "log_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"request_id" varchar(120),
	"trace_id" varchar(120),
	"user_id" uuid,
	"event_name" varchar(120) NOT NULL,
	"level" "log_level" DEFAULT 'info' NOT NULL,
	"source" varchar(60),
	"message" text NOT NULL,
	"metadata" jsonb,
	"flushed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"provider" varchar(50) NOT NULL,
	"provider_transaction_id" varchar(120),
	"method" varchar(60),
	"status" "payment_status" DEFAULT 'pending' NOT NULL,
	"amount_cents" integer NOT NULL,
	"currency" varchar(3) DEFAULT 'IDR' NOT NULL,
	"paid_at" timestamp with time zone,
	"expired_at" timestamp with time zone,
	"failure_reason" text,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "queue_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"user_id" uuid,
	"queue_token" varchar(120) NOT NULL,
	"status" "queue_entry_status" DEFAULT 'waiting' NOT NULL,
	"position" integer NOT NULL,
	"priority" integer DEFAULT 0 NOT NULL,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"allowed_at" timestamp with time zone,
	"entered_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "seat_generation_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"requested_by" uuid NOT NULL,
	"status" "generation_job_status" DEFAULT 'queued' NOT NULL,
	"total_sections" integer DEFAULT 0 NOT NULL,
	"total_seats" integer DEFAULT 0 NOT NULL,
	"generated_seats" integer DEFAULT 0 NOT NULL,
	"config" jsonb NOT NULL,
	"error_message" text,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "seats" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_section_id" uuid NOT NULL,
	"seat_code" varchar(40) NOT NULL,
	"row_label" varchar(20) NOT NULL,
	"seat_number" integer NOT NULL,
	"display_name" varchar(80) NOT NULL,
	"status" "seat_status" DEFAULT 'available' NOT NULL,
	"hold_expires_at" timestamp with time zone,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stream_renditions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"stream_id" uuid NOT NULL,
	"quality" "stream_quality" NOT NULL,
	"width" integer NOT NULL,
	"height" integer NOT NULL,
	"bitrate_kbps" integer NOT NULL,
	"playlist_url" text NOT NULL,
	"segment_prefix" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stream_viewer_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"stream_id" uuid NOT NULL,
	"user_id" uuid,
	"playback_session_token" varchar(120) NOT NULL,
	"status" "viewer_session_status" DEFAULT 'active' NOT NULL,
	"selected_quality" "stream_quality",
	"bandwidth_kbps" integer,
	"device_type" varchar(40),
	"ip_address" varchar(45),
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone,
	"last_heartbeat_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "streams" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"ingest_url" text,
	"playback_url" text,
	"hls_manifest_url" text,
	"stream_key" varchar(120) NOT NULL,
	"status" "stream_status" DEFAULT 'scheduled' NOT NULL,
	"is_live" boolean DEFAULT false NOT NULL,
	"live_started_at" timestamp with time zone,
	"live_ended_at" timestamp with time zone,
	"player_settings" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ticket_order_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"seat_id" uuid NOT NULL,
	"event_section_id" uuid NOT NULL,
	"seat_code_snapshot" varchar(40) NOT NULL,
	"row_label_snapshot" varchar(20) NOT NULL,
	"seat_number_snapshot" integer NOT NULL,
	"unit_price_cents" integer NOT NULL,
	"line_total_cents" integer NOT NULL,
	"status" "order_item_status" DEFAULT 'reserved' NOT NULL,
	"released_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ticket_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_number" varchar(40) NOT NULL,
	"user_id" uuid NOT NULL,
	"event_id" uuid NOT NULL,
	"queue_entry_id" uuid,
	"status" "order_status" DEFAULT 'pending_payment' NOT NULL,
	"currency" varchar(3) DEFAULT 'IDR' NOT NULL,
	"subtotal_cents" integer DEFAULT 0 NOT NULL,
	"service_fee_cents" integer DEFAULT 0 NOT NULL,
	"discount_cents" integer DEFAULT 0 NOT NULL,
	"total_cents" integer DEFAULT 0 NOT NULL,
	"reserved_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"confirmed_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"notes" text,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" varchar(255) NOT NULL,
	"password_hash" text NOT NULL,
	"full_name" varchar(160) NOT NULL,
	"phone" varchar(32),
	"avatar_url" text,
	"role" "user_role" DEFAULT 'customer' NOT NULL,
	"status" "user_status" DEFAULT 'active' NOT NULL,
	"last_login_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "dashboard_snapshots" ADD CONSTRAINT "dashboard_snapshots_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_sections" ADD CONSTRAINT "event_sections_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "log_entries" ADD CONSTRAINT "log_entries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_order_id_ticket_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."ticket_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "queue_entries" ADD CONSTRAINT "queue_entries_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "queue_entries" ADD CONSTRAINT "queue_entries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seat_generation_jobs" ADD CONSTRAINT "seat_generation_jobs_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seat_generation_jobs" ADD CONSTRAINT "seat_generation_jobs_requested_by_users_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seats" ADD CONSTRAINT "seats_event_section_id_event_sections_id_fk" FOREIGN KEY ("event_section_id") REFERENCES "public"."event_sections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stream_renditions" ADD CONSTRAINT "stream_renditions_stream_id_streams_id_fk" FOREIGN KEY ("stream_id") REFERENCES "public"."streams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stream_viewer_sessions" ADD CONSTRAINT "stream_viewer_sessions_stream_id_streams_id_fk" FOREIGN KEY ("stream_id") REFERENCES "public"."streams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stream_viewer_sessions" ADD CONSTRAINT "stream_viewer_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "streams" ADD CONSTRAINT "streams_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_order_items" ADD CONSTRAINT "ticket_order_items_order_id_ticket_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."ticket_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_order_items" ADD CONSTRAINT "ticket_order_items_seat_id_seats_id_fk" FOREIGN KEY ("seat_id") REFERENCES "public"."seats"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_order_items" ADD CONSTRAINT "ticket_order_items_event_section_id_event_sections_id_fk" FOREIGN KEY ("event_section_id") REFERENCES "public"."event_sections"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_orders" ADD CONSTRAINT "ticket_orders_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_orders" ADD CONSTRAINT "ticket_orders_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_orders" ADD CONSTRAINT "ticket_orders_queue_entry_id_queue_entries_id_fk" FOREIGN KEY ("queue_entry_id") REFERENCES "public"."queue_entries"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "dashboard_snapshots_scope_idx" ON "dashboard_snapshots" USING btree ("scope","snapshot_at");--> statement-breakpoint
CREATE INDEX "dashboard_snapshots_event_idx" ON "dashboard_snapshots" USING btree ("event_id","snapshot_at");--> statement-breakpoint
CREATE UNIQUE INDEX "event_sections_event_code_unique_idx" ON "event_sections" USING btree ("event_id","code");--> statement-breakpoint
CREATE INDEX "event_sections_event_sort_idx" ON "event_sections" USING btree ("event_id","sort_order");--> statement-breakpoint
CREATE INDEX "event_sections_status_idx" ON "event_sections" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "events_slug_unique_idx" ON "events" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "events_status_idx" ON "events" USING btree ("status");--> statement-breakpoint
CREATE INDEX "events_starts_at_idx" ON "events" USING btree ("starts_at");--> statement-breakpoint
CREATE INDEX "events_created_by_idx" ON "events" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX "log_entries_level_idx" ON "log_entries" USING btree ("level");--> statement-breakpoint
CREATE INDEX "log_entries_user_idx" ON "log_entries" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "log_entries_created_at_idx" ON "log_entries" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "payments_order_unique_idx" ON "payments" USING btree ("order_id");--> statement-breakpoint
CREATE UNIQUE INDEX "payments_provider_ref_unique_idx" ON "payments" USING btree ("provider","provider_transaction_id");--> statement-breakpoint
CREATE INDEX "payments_order_status_idx" ON "payments" USING btree ("order_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "queue_entries_token_unique_idx" ON "queue_entries" USING btree ("queue_token");--> statement-breakpoint
CREATE INDEX "queue_entries_event_status_idx" ON "queue_entries" USING btree ("event_id","status");--> statement-breakpoint
CREATE INDEX "queue_entries_user_status_idx" ON "queue_entries" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "seat_generation_jobs_event_status_idx" ON "seat_generation_jobs" USING btree ("event_id","status");--> statement-breakpoint
CREATE INDEX "seat_generation_jobs_requested_by_idx" ON "seat_generation_jobs" USING btree ("requested_by");--> statement-breakpoint
CREATE UNIQUE INDEX "seats_section_seat_unique_idx" ON "seats" USING btree ("event_section_id","seat_code");--> statement-breakpoint
CREATE UNIQUE INDEX "seats_section_row_seat_unique_idx" ON "seats" USING btree ("event_section_id","row_label","seat_number");--> statement-breakpoint
CREATE INDEX "seats_section_status_idx" ON "seats" USING btree ("event_section_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "stream_renditions_stream_quality_unique_idx" ON "stream_renditions" USING btree ("stream_id","quality");--> statement-breakpoint
CREATE INDEX "stream_renditions_stream_active_idx" ON "stream_renditions" USING btree ("stream_id","is_active");--> statement-breakpoint
CREATE UNIQUE INDEX "stream_viewer_sessions_token_unique_idx" ON "stream_viewer_sessions" USING btree ("playback_session_token");--> statement-breakpoint
CREATE INDEX "stream_viewer_sessions_stream_status_idx" ON "stream_viewer_sessions" USING btree ("stream_id","status");--> statement-breakpoint
CREATE INDEX "stream_viewer_sessions_user_status_idx" ON "stream_viewer_sessions" USING btree ("user_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "streams_event_unique_idx" ON "streams" USING btree ("event_id");--> statement-breakpoint
CREATE UNIQUE INDEX "streams_stream_key_unique_idx" ON "streams" USING btree ("stream_key");--> statement-breakpoint
CREATE INDEX "streams_status_idx" ON "streams" USING btree ("status","is_live");--> statement-breakpoint
CREATE UNIQUE INDEX "ticket_order_items_order_seat_unique_idx" ON "ticket_order_items" USING btree ("order_id","seat_id");--> statement-breakpoint
CREATE INDEX "ticket_order_items_seat_status_idx" ON "ticket_order_items" USING btree ("seat_id","status");--> statement-breakpoint
CREATE INDEX "ticket_order_items_order_status_idx" ON "ticket_order_items" USING btree ("order_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "ticket_orders_order_number_unique_idx" ON "ticket_orders" USING btree ("order_number");--> statement-breakpoint
CREATE INDEX "ticket_orders_user_status_idx" ON "ticket_orders" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "ticket_orders_event_status_idx" ON "ticket_orders" USING btree ("event_id","status");--> statement-breakpoint
CREATE INDEX "ticket_orders_expires_at_idx" ON "ticket_orders" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_unique_idx" ON "users" USING btree ("email");--> statement-breakpoint
CREATE INDEX "users_role_idx" ON "users" USING btree ("role");--> statement-breakpoint
CREATE INDEX "users_status_idx" ON "users" USING btree ("status");