/**
 * Skema relasi blokir antar pengguna (blockerId memblokir blockedId).
 * Blokir bersifat simetris di lapisan service: DM, presence, kontak,
 * search, dan push sama-sama difilter untuk kedua arah.
 */
import { pgTable, uuid, timestamp, unique } from 'drizzle-orm/pg-core';
import { users } from './users';

export const blockedUsers = pgTable(
  'blocked_users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    blockerId: uuid('blocker_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    blockedId: uuid('blocked_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    unq: unique().on(table.blockerId, table.blockedId),
  }),
);
