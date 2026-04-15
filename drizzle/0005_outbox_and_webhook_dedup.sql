CREATE TABLE "outbox_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "aggregate_type" varchar(64) NOT NULL,
  "aggregate_id" uuid,
  "event_type" varchar(128) NOT NULL,
  "routing_key" varchar(128) NOT NULL,
  "payload" jsonb NOT NULL,
  "status" varchar(20) DEFAULT 'pending' NOT NULL,
  "attempts" integer DEFAULT 0 NOT NULL,
  "next_attempt_at" timestamp with time zone,
  "last_error" text,
  "published_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "outbox_events_status_next_attempt_idx" ON "outbox_events" USING btree ("status","next_attempt_at");
--> statement-breakpoint
CREATE INDEX "outbox_events_aggregate_idx" ON "outbox_events" USING btree ("aggregate_type","aggregate_id");
--> statement-breakpoint
CREATE INDEX "outbox_events_created_at_idx" ON "outbox_events" USING btree ("created_at");
--> statement-breakpoint

WITH dedup AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY provider, webhook_event_id
      ORDER BY updated_at DESC, created_at DESC, id DESC
    ) AS rn
  FROM payment_transactions
  WHERE webhook_event_id IS NOT NULL
)
DELETE FROM payment_transactions p
USING dedup d
WHERE p.id = d.id
  AND d.rn > 1;
--> statement-breakpoint

CREATE UNIQUE INDEX "payment_transactions_provider_webhook_event_unique_idx"
ON "payment_transactions" USING btree ("provider", "webhook_event_id");
