CREATE TABLE IF NOT EXISTS "follows" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"follower_id" uuid NOT NULL,
	"following_id" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "follows" ADD CONSTRAINT "follows_follower_id_users_id_fk" FOREIGN KEY ("follower_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "follows" ADD CONSTRAINT "follows_following_id_users_id_fk" FOREIGN KEY ("following_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "follows_follower_id_following_id_unique" ON "follows" USING btree ("follower_id","following_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "follows_following_id_index" ON "follows" USING btree ("following_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "follows_follower_id_index" ON "follows" USING btree ("follower_id");
--> statement-breakpoint
INSERT INTO "follows" ("follower_id", "following_id", "created_at")
SELECT fr.sender_id, fr.receiver_id, fr.created_at
FROM "friend_requests" fr
WHERE fr.status = 'ACCEPTED';
--> statement-breakpoint
INSERT INTO "follows" ("follower_id", "following_id", "created_at")
SELECT fr.receiver_id, fr.sender_id, fr.created_at
FROM "friend_requests" fr
WHERE fr.status = 'ACCEPTED';
--> statement-breakpoint
DELETE FROM "notifications" WHERE "type" IN ('friend_request_received', 'friend_request_accepted');
--> statement-breakpoint
ALTER TABLE "notifications" DROP COLUMN IF EXISTS "friend_request_id";
--> statement-breakpoint
DROP TABLE IF EXISTS "friend_requests";
