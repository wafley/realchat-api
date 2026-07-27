import { pgTable, uuid, timestamp, unique, index } from 'drizzle-orm/pg-core';
import { users } from './users';

export const follows = pgTable(
  'follows',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    followerId: uuid('follower_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    followingId: uuid('following_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (table) => ({
    unq: unique().on(table.followerId, table.followingId),
    followingIdx: index().on(table.followingId),
    followerIdx: index().on(table.followerId),
  }),
);
