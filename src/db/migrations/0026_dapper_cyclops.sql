-- Konsolidasi data duplikat: keep only the latest reaction per user per message
DELETE FROM "message_reactions" a
USING "message_reactions" b
WHERE a."message_id" = b."message_id"
  AND a."user_id" = b."user_id"
  AND a."emoji" != b."emoji"
  AND a."created_at" < b."created_at";
--> statement-breakpoint
ALTER TABLE "message_reactions" DROP CONSTRAINT "message_reactions_message_id_user_id_emoji_unique";--> statement-breakpoint
ALTER TABLE "message_reactions" ADD CONSTRAINT "message_reactions_message_id_user_id_unique" UNIQUE("message_id","user_id");