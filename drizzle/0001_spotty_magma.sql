ALTER TABLE "users" ADD COLUMN "username" varchar(80) NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "users_username_unique_idx" ON "users" USING btree ("username");