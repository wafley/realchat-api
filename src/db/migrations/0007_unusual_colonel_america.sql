CREATE TABLE "contacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"contact_id" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "contacts_user_id_contact_id_unique" UNIQUE("user_id","contact_id")
);
--> statement-breakpoint
INSERT INTO "contacts" ("user_id", "contact_id", "created_at")
SELECT "follower_id", "following_id", "created_at"
FROM "follows"
ON CONFLICT DO NOTHING;
--> statement-breakpoint
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_contact_id_users_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "contacts_contact_id_index" ON "contacts" USING btree ("contact_id");--> statement-breakpoint
CREATE INDEX "contacts_user_id_index" ON "contacts" USING btree ("user_id");--> statement-breakpoint
DROP TABLE IF EXISTS "follows" CASCADE;
