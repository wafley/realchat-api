import { pgTable, uuid, varchar, text, timestamp } from 'drizzle-orm/pg-core';
import { users } from './users.js';

export const conversations = pgTable('conversations', {
  id: uuid('id').primaryKey().defaultRandom(),
  type: varchar('type', { length: 10 }).notNull(),
  name: varchar('name', { length: 100 }),
  avatarUrl: text('avatar_url'),
  description: text('description'),
  createdBy: uuid('created_by').references(() => users.id),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});