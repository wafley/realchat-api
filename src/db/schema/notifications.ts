import { pgTable, uuid, varchar, text, boolean, timestamp, index } from 'drizzle-orm/pg-core';
import { users } from './users';
import { conversations } from './conversations';
import { messages } from './messages';

export const notifications = pgTable(
  'notifications',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    type: varchar('type', { length: 50 }).notNull(),
    actorId: uuid('actor_id').references(() => users.id),
    conversationId: uuid('conversation_id').references(() => conversations.id),
    messageId: uuid('message_id').references(() => messages.id),
    title: varchar('title', { length: 100 }).notNull(),
    body: text('body').notNull(),
    isRead: boolean('is_read').notNull().default(false),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (table) => ({
    userIdx: index().on(table.userId, table.isRead, table.createdAt),
  }),
);
