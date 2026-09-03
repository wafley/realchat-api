ALTER TABLE "messages" ADD COLUMN "is_forwarded" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "forward_count" integer DEFAULT 0 NOT NULL;