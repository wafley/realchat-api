import { pgTable, uuid, varchar, timestamp, unique, index } from 'drizzle-orm/pg-core';
import { users } from './users';
import { conversations } from './conversations';

export const conversationMembers = pgTable(
  'conversation_members',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    conversationId: uuid('conversation_id')
      .notNull()
      .references(() => conversations.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: varchar('role', { length: 10 }).notNull().default('MEMBER'),
    joinedAt: timestamp('joined_at', { withTimezone: true }).notNull().defaultNow(),
    mutedUntil: timestamp('muted_until', { withTimezone: true }),
    clearedAt: timestamp('cleared_at', { withTimezone: true }),
  },
  (table) => ({
    unq: unique().on(table.conversationId, table.userId),
    userIdx: index('conversation_members_user_id_idx').on(table.userId),
  }),
);
