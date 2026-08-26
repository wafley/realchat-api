ALTER TABLE "users" DROP CONSTRAINT "users_email_unique";
CREATE UNIQUE INDEX "users_email_lower_unique" ON "users" (lower("email"));