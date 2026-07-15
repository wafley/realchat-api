import { pgTable, uuid, varchar, timestamp, unique } from 'drizzle-orm/pg-core';
import { users } from './users.js';
import { conversations } from './conversations.js';

export const conversationMembers = pgTable('conversation_members', {
  id: uuid('id').primaryKey().defaultRandom(),
  conversationId: uuid('conversation_id').notNull().references(() => conversations.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  role: varchar('role', { length: 10 }).notNull().default('MEMBER'),
  joinedAt: timestamp('joined_at').notNull().defaultNow(),
  mutedUntil: timestamp('muted_until'),
  clearedAt: timestamp('cleared_at'),
}, (table) => ({
  unq: unique().on(table.conversationId, table.userId),
}));