ALTER TABLE "users" DROP CONSTRAINT "users_username_unique";--> statement-breakpoint
CREATE UNIQUE INDEX "users_username_lower_unique" ON "users" USING btree (lower("username"));