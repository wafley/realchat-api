/**
 * Skema status pengiriman pesan per penerima (SENT/DELIVERED/SEEN).
 * Satu baris unik per (messageId, userId) - dasar read receipt.
 */
import { pgTable, uuid, varchar, timestamp, unique } from 'drizzle-orm/pg-core';
import { users } from './users';
import { messages } from './messages';

export const messageStatus = pgTable(
  'message_status',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    messageId: uuid('message_id')
      .notNull()
      .references(() => messages.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    status: varchar('status', { length: 10 }).notNull().default('SENT'),
    seenAt: timestamp('seen_at', { withTimezone: true }),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    unq: unique().on(table.messageId, table.userId),
  }),
);
