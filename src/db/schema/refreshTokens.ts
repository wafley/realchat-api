/**
 * Skema refresh token dengan rotasi & deteksi reuse (token family).
 * parentJti mencatat token sebelumnya; pemakaian jti yang sudah revoked
 * menandakan pencurian token dan memicu revoke seluruh familyId.
 */
import { pgTable, uuid, text, timestamp } from 'drizzle-orm/pg-core';
import { users } from './users';

export const refreshTokens = pgTable('refresh_tokens', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  token: text('token').notNull().unique(),
  // ID unik di dalam payload JWT; dipakai untuk lookup cepat saat rotasi.
  jti: text('jti').notNull().unique(),
  familyId: uuid('family_id').notNull(),
  parentJti: text('parent_jti'),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
  expiredAt: timestamp('expired_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
