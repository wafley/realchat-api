/**
 * Lapisan akses data (Drizzle ORM) untuk tabel notifications: CRUD notifikasi,
 * penghitungan belum dibaca, dan penandaan baca. Semua query dibatasi pada
 * kolom terpilih agar bentuk data konsisten untuk lapisan service.
 */
import db from '../../db/index';
import { notifications } from '../../db/schema/notifications';
import { and, desc, eq, sql } from 'drizzle-orm';

/** Kolom notifikasi yang diambil dari DB untuk semua query select. */
const notificationColumns = {
  id: notifications.id,
  userId: notifications.userId,
  type: notifications.type,
  actorId: notifications.actorId,
  conversationId: notifications.conversationId,
  messageId: notifications.messageId,
  title: notifications.title,
  body: notifications.body,
  isRead: notifications.isRead,
  createdAt: notifications.createdAt,
};

/** Bentuk data yang dibutuhkan untuk membuat notifikasi baru. */
export type CreateNotificationData = {
  userId: string;
  type: string;
  actorId?: string;
  conversationId?: string;
  messageId?: string;
  title: string;
  body: string;
};

/**
 * Menyisipkan banyak notifikasi sekaligus dalam satu query.
 * @returns Baris notifikasi yang tersimpan; array kosong jika input kosong.
 */
export async function createMany(data: CreateNotificationData[]) {
  if (data.length === 0) return [];
  return db.insert(notifications).values(data).returning(notificationColumns);
}

/** Menyisipkan satu notifikasi dan mengembalikan barisnya. */
export async function create(data: CreateNotificationData) {
  const [notif] = await createMany([data]);
  return notif;
}

/** Mencari notifikasi berdasarkan id; null jika tidak ditemukan. */
export async function findById(id: string) {
  const [notif] = await db
    .select(notificationColumns)
    .from(notifications)
    .where(eq(notifications.id, id));
  return notif || null;
}

/** Daftar notifikasi milik user, terbaru dulu, dengan paginasi offset. */
export async function findByUserId(userId: string, limit = 20, offset = 0) {
  return db
    .select(notificationColumns)
    .from(notifications)
    .where(eq(notifications.userId, userId))
    .orderBy(desc(notifications.createdAt))
    .limit(limit)
    .offset(offset);
}

/** Menghitung notifikasi milik user yang belum dibaca. */
export async function findUnreadCount(userId: string) {
  const [result] = await db
    .select({ count: sql<number>`count(*)` })
    .from(notifications)
    .where(and(eq(notifications.userId, userId), eq(notifications.isRead, false)));
  return Number(result.count);
}

/**
 * Menandai satu notifikasi sebagai dibaca; where digabung dengan userId agar
 * user lain tidak bisa mengubah notifikasi yang bukan miliknya.
 */
export async function markAsRead(id: string, userId: string) {
  const [notif] = await db
    .update(notifications)
    .set({ isRead: true })
    .where(and(eq(notifications.id, id), eq(notifications.userId, userId)))
    .returning(notificationColumns);
  return notif || null;
}

/** Menandai semua notifikasi milik user yang belum dibaca sebagai dibaca. */
export async function markAllAsRead(userId: string) {
  await db
    .update(notifications)
    .set({ isRead: true })
    .where(and(eq(notifications.userId, userId), eq(notifications.isRead, false)));
}

/**
 * Menghapus satu notifikasi dengan syarat pemiliknya cocok.
 * @returns Baris id yang terhapus; null jika tidak ada yang cocok.
 */
export async function deleteById(id: string, userId: string) {
  const [deleted] = await db
    .delete(notifications)
    .where(and(eq(notifications.id, id), eq(notifications.userId, userId)))
    .returning({ id: notifications.id });
  return deleted || null;
}

/** Menghapus semua notifikasi milik user; mengembalikan jumlah terhapus. */
export async function deleteAll(userId: string) {
  const deleted = await db
    .delete(notifications)
    .where(eq(notifications.userId, userId))
    .returning({ id: notifications.id });
  return deleted.length;
}
