ALTER TABLE "users" ADD COLUMN "notify_new_messages" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "notify_group_invites" boolean DEFAULT true NOT NULL;