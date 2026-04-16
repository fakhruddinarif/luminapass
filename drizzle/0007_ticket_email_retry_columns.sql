ALTER TABLE "ticket_orders"
ADD COLUMN "ticket_email_retry_count" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE "ticket_orders"
ADD COLUMN "ticket_email_next_retry_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "ticket_orders"
ADD COLUMN "ticket_email_last_error" text;
--> statement-breakpoint
CREATE INDEX "ticket_orders_ticket_email_retry_idx"
ON "ticket_orders" USING btree ("ticket_email_sent_at", "ticket_email_next_retry_at", "ticket_email_retry_count");
