ALTER TABLE "messages" ADD COLUMN "file_url" text;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "file_name" text;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "file_size" bigint;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "mime_type" varchar(100);--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "duration" integer;