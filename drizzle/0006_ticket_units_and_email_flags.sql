ALTER TABLE "ticket_orders"
ADD COLUMN "suppress_ticket_email" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE "ticket_orders"
ADD COLUMN "ticket_email_sent_at" timestamp with time zone;
--> statement-breakpoint

CREATE TABLE "ticket_units" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "order_id" uuid NOT NULL,
  "order_item_id" uuid NOT NULL,
  "event_id" uuid NOT NULL,
  "event_section_id" uuid NOT NULL,
  "user_id" uuid,
  "ticket_code" varchar(80) NOT NULL,
  "barcode_value" varchar(180) NOT NULL,
  "barcode_format" varchar(32) DEFAULT 'code128' NOT NULL,
  "barcode_payload" text NOT NULL,
  "is_used" boolean DEFAULT false NOT NULL,
  "used_at" timestamp with time zone,
  "emailed_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "ticket_units_ticket_code_unique" UNIQUE("ticket_code"),
  CONSTRAINT "ticket_units_barcode_value_unique" UNIQUE("barcode_value"),
  CONSTRAINT "ticket_units_order_id_ticket_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."ticket_orders"("id") ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "ticket_units_order_item_id_ticket_order_items_id_fk" FOREIGN KEY ("order_item_id") REFERENCES "public"."ticket_order_items"("id") ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "ticket_units_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE restrict ON UPDATE no action,
  CONSTRAINT "ticket_units_event_section_id_event_sections_id_fk" FOREIGN KEY ("event_section_id") REFERENCES "public"."event_sections"("id") ON DELETE restrict ON UPDATE no action,
  CONSTRAINT "ticket_units_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action
);
--> statement-breakpoint

CREATE INDEX "ticket_units_order_idx" ON "ticket_units" USING btree ("order_id");
--> statement-breakpoint
CREATE INDEX "ticket_units_order_item_idx" ON "ticket_units" USING btree ("order_item_id");
--> statement-breakpoint
CREATE INDEX "ticket_units_user_idx" ON "ticket_units" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX "ticket_units_event_idx" ON "ticket_units" USING btree ("event_id");
--> statement-breakpoint
CREATE INDEX "ticket_units_email_status_idx" ON "ticket_units" USING btree ("order_id", "emailed_at");
