/**
 * Skema tabel pengguna: kredensial, profil, presence, verifikasi email,
 * reset password, dan soft-delete (anonimisasi akun).
 */
import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  boolean,
  integer,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    username: varchar('username', { length: 50 }).notNull(),
    // Cooldown ganti username (30 hari) - null berarti belum pernah ganti.
    usernameUpdatedAt: timestamp('username_updated_at', { withTimezone: true }),
    email: varchar('email', { length: 255 }).notNull(),
    passwordHash: text('password_hash').notNull(),
    bio: text('bio'),
    fullName: varchar('full_name', { length: 100 }),
    avatarUrl: text('avatar_url'),
    statusText: varchar('status_text', { length: 100 }).default('Hey there!'),
    isOnline: boolean('is_online').notNull().default(false),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }),
    isVerified: boolean('is_verified').notNull().default(false),
    // Naikkan versi ini untuk membatalkan semua access token lama (logout-all/delete).
    tokenVersion: integer('token_version').notNull().default(0),
    verificationToken: text('verification_token'),
    verificationTokenExpiresAt: timestamp('verification_token_expires_at', {
      withTimezone: true,
    }),
    resetToken: text('reset_token'),
    resetTokenExpiresAt: timestamp('reset_token_expires_at', {
      withTimezone: true,
    }),
    // Soft-delete: non-null berarti akun sudah dianonimasi & disembunyikan.
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    // Privasi: siapa boleh melihat lastSeenAt/isOnline (EVERYONE/CONTACTS/NOBODY).
    lastSeenVisibility: varchar('last_seen_visibility', { length: 10 })
      .notNull()
      .default('EVERYONE'),
    // Privasi: siapa boleh menambahkan pengguna ini ke grup (nilai sama di atas).
    groupInvitePolicy: varchar('group_invite_policy', { length: 10 })
      .notNull()
      .default('EVERYONE'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  // Username unik secara case-insensitive (dicek via lower()).
  (table) => [uniqueIndex('users_username_lower_unique').on(sql`lower(${table.username})`)],
);
