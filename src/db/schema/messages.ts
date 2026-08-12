import { pgTable, uuid, varchar, text, timestamp, boolean, index } from 'drizzle-orm/pg-core';
import { users } from './users';
import { conversations } from './conversations';

export const messages = pgTable(
  'messages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    conversationId: uuid('conversation_id')
      .notNull()
      .references(() => conversations.id, { onDelete: 'cascade' }),
    senderId: uuid('sender_id')
      .notNull()
      .references(() => users.id),
    type: varchar('type', { length: 10 }).notNull().default('TEXT'),
    content: text('content').notNull(),
    replyToId: uuid('reply_to_id'),
    isPinned: boolean('is_pinned').notNull().default(false),
    pinnedAt: timestamp('pinned_at', { withTimezone: true }),
    isEdited: boolean('is_edited').notNull().default(false),
    isDeleted: boolean('is_deleted').notNull().default(false),
    editedAt: timestamp('edited_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    conversationIdx: index().on(table.conversationId, table.createdAt),
  }),
);
