/**
 * Skema tabel percakapan: mencakup DM (PRIVATE) dan grup (GROUP).
 * Nama/avatar/deskripsi hanya terisi untuk tipe GROUP.
 */
import { pgTable, uuid, varchar, text, timestamp } from 'drizzle-orm/pg-core';
import { users } from './users';

export const conversations = pgTable('conversations', {
  id: uuid('id').primaryKey().defaultRandom(),
  // 'PRIVATE' untuk DM antar dua pengguna, 'GROUP' untuk percakapan grup.
  type: varchar('type', { length: 10 }).notNull(),
  name: varchar('name', { length: 100 }),
  avatarUrl: text('avatar_url'),
  description: text('description'),
  // Pembuat grup; dipakai sebagai acuan transfer ownership saat owner leave.
  createdBy: uuid('created_by').references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
