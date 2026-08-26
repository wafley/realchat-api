/**
 * Skema keanggotaan percakapan (anggota DM & grup) beserta state per anggota:
 * role, mute, clear chat, dan hide chat.
 */
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
    // 'ADMIN' atau 'MEMBER'; ownership grup tetap mengacu conversations.createdBy.
    role: varchar('role', { length: 10 }).notNull().default('MEMBER'),
    joinedAt: timestamp('joined_at', { withTimezone: true }).notNull().defaultNow(),
    mutedUntil: timestamp('muted_until', { withTimezone: true }),
    // Batas waktu clear chat: pesan sebelum clearedAt disembunyikan untuk anggota ini.
    clearedAt: timestamp('cleared_at', { withTimezone: true }),
    // Waktu chat disembunyikan dari daftar chat; muncul lagi saat ada pesan baru.
    hiddenAt: timestamp('hidden_at', { withTimezone: true }),
  },
  (table) => ({
    unq: unique().on(table.conversationId, table.userId),
    userIdx: index('conversation_members_user_id_idx').on(table.userId),
  }),
);
