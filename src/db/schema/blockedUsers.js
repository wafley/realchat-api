import { pgTable, uuid, timestamp, unique } from 'drizzle-orm/pg-core';
import { users } from './users.js';

export const blockedUsers = pgTable('blocked_users', {
  id: uuid('id').primaryKey().defaultRandom(),
  blockerId: uuid('blocker_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  blockedId: uuid('blocked_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (table) => ({
  unq: unique().on(table.blockerId, table.blockedId),
}));