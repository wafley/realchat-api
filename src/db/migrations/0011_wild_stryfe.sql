ALTER TABLE "messages" ADD COLUMN "pinned_at" timestamp with time zone;

-- Backfill: keep existing pinned messages ordered sensibly
UPDATE "messages" SET "pinned_at" = "updated_at" WHERE "is_pinned" = true;