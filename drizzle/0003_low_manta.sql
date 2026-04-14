CREATE TABLE "audit_trails" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"endpoint" varchar(255) NOT NULL,
	"datetime" timestamp with time zone DEFAULT now() NOT NULL,
	"ip" varchar(64) NOT NULL,
	"user" text NOT NULL,
	"method" varchar(16) NOT NULL,
	"request" jsonb,
	"response" jsonb,
	"status" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DROP TABLE "events" CASCADE;--> statement-breakpoint
DROP TABLE "event_sections" CASCADE;--> statement-breakpoint
DROP TABLE "seats" CASCADE;--> statement-breakpoint
DROP TABLE "queue_entries" CASCADE;--> statement-breakpoint
DROP TABLE "ticket_orders" CASCADE;--> statement-breakpoint
DROP TABLE "ticket_order_items" CASCADE;--> statement-breakpoint
DROP TABLE "payments" CASCADE;--> statement-breakpoint
DROP TABLE "seat_generation_jobs" CASCADE;--> statement-breakpoint
DROP TABLE "streams" CASCADE;--> statement-breakpoint
DROP TABLE "stream_renditions" CASCADE;--> statement-breakpoint
DROP TABLE "stream_viewer_sessions" CASCADE;--> statement-breakpoint
DROP TABLE "log_entries" CASCADE;--> statement-breakpoint
DROP TABLE "dashboard_snapshots" CASCADE;--> statement-breakpoint
CREATE INDEX "audit_trails_endpoint_idx" ON "audit_trails" USING btree ("endpoint");--> statement-breakpoint
CREATE INDEX "audit_trails_method_idx" ON "audit_trails" USING btree ("method");--> statement-breakpoint
CREATE INDEX "audit_trails_datetime_idx" ON "audit_trails" USING btree ("datetime");--> statement-breakpoint
CREATE INDEX "audit_trails_user_idx" ON "audit_trails" USING btree ("user");--> statement-breakpoint
CREATE INDEX "audit_trails_status_idx" ON "audit_trails" USING btree ("status");--> statement-breakpoint
DROP TYPE "public"."dashboard_scope";--> statement-breakpoint
DROP TYPE "public"."event_status";--> statement-breakpoint
DROP TYPE "public"."generation_job_status";--> statement-breakpoint
DROP TYPE "public"."log_level";--> statement-breakpoint
DROP TYPE "public"."order_item_status";--> statement-breakpoint
DROP TYPE "public"."order_status";--> statement-breakpoint
DROP TYPE "public"."payment_status";--> statement-breakpoint
DROP TYPE "public"."queue_entry_status";--> statement-breakpoint
DROP TYPE "public"."seat_status";--> statement-breakpoint
DROP TYPE "public"."section_status";--> statement-breakpoint
DROP TYPE "public"."stream_quality";--> statement-breakpoint
DROP TYPE "public"."stream_status";--> statement-breakpoint
DROP TYPE "public"."viewer_session_status";