ALTER TABLE "users" ADD COLUMN "username_updated_at" timestamp;--> statement-breakpoint
UPDATE "users" SET "username_updated_at" = "created_at" WHERE "username_updated_at" IS NULL;