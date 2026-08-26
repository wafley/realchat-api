/**
 * Layanan logika bisnis notifikasi: membuat notifikasi lalu menyiarkannya via
 * Socket.IO, membaca daftar/jumlah belum dibaca, serta menandai baca dan hapus
 * dengan validasi kepemilikan agar user hanya mengelola notifikasinya sendiri.
 */
import * as repository from './notifications.repository';
import type { CreateNotificationData } from './notifications.repository';
import { NotFoundError, ForbiddenError } from '../../utils/errors';
import { getIO } from '../../socket/index';
import { extractMentions } from '../../utils/mentions';
import { findUserById, findUserIdsByUsernames } from '../auth/auth.repository';

/**
 * Membuat banyak notifikasi sekaligus lalu menyiarkan event 'notification:new'
 * ke room pribadi masing-masing user penerima via Socket.IO.
 * @param items - Data notifikasi yang akan dibuat.
 * @returns Daftar notifikasi yang berhasil tersimpan.
 */
export async function createAndEmitMany(items: CreateNotificationData[]) {
  const notifs = await repository.createMany(items);
  const io = getIO();
  for (const notif of notifs) {
    io.to(`user:${notif.userId}`).emit('notification:new', { notification: notif });
  }
  return notifs;
}

/** Membuat satu notifikasi dan langsung menyiarkannya ke user penerima. */
export async function createAndEmit(data: CreateNotificationData) {
  const [notif] = await createAndEmitMany([data]);
  return notif;
}

/** Parameter untuk pembuatan notifikasi mention ke anggota percakapan. */
export interface NotifyMentionsParams {
  conversationId: string;
  messageId: string;
  actorId: string;
  content: string;
  /** Daftar penerima dengan field userId; dipakai untuk filter anggota target. */
  recipients: ReadonlyArray<{ userId: string }>;
}

/**
 * Memproses @username pada isi pesan lalu membuat notifikasi tipe 'mention'
 * untuk setiap anggota percakapan yang relevan. Kegagalan notifikasi tidak
 * boleh menggagalkan operasi pemanggil — pemanggil wajib membungkusnya
 * dalam blok try/catch tersendiri jika diperlukan.
 */
export async function notifyConversationMentions(params: NotifyMentionsParams): Promise<void> {
  const usernames = extractMentions(params.content);
  if (usernames.length === 0) return;
  const mentioned = await findUserIdsByUsernames(usernames);
  if (mentioned.length === 0) return;
  const recipientIds = new Set(params.recipients.map((r) => r.userId));
  const targets = mentioned.filter((m) => recipientIds.has(m.id));
  if (targets.length === 0) return;
  const sender = await findUserById(params.actorId);
  await createAndEmitMany(
    targets.map((t) => ({
      userId: t.id,
      type: 'mention',
      actorId: params.actorId,
      conversationId: params.conversationId,
      messageId: params.messageId,
      title: 'Mention',
      body: `@${sender?.username || 'Someone'} menyebut Anda`,
    })),
  );
}

/**
 * Mengambil daftar notifikasi milik user (dengan paginasi offset)
 * beserta jumlah notifikasi yang belum dibaca.
 */
export async function getNotifications(userId: string, limit: number, offset: number) {
  const items = await repository.findByUserId(userId, limit, offset);
  const totalUnread = await repository.findUnreadCount(userId);
  return { items, totalUnread };
}

/** Menghitung jumlah notifikasi yang belum dibaca untuk user tertentu. */
export async function getUnreadCount(userId: string) {
  const count = await repository.findUnreadCount(userId);
  return { count };
}

/**
 * Menandai satu notifikasi sebagai sudah dibaca.
 * @throws NotFoundError jika notifikasi tidak ada.
 * @throws ForbiddenError jika notifikasi bukan milik user tersebut.
 */
export async function markAsRead(userId: string, notificationId: string) {
  const notif = await repository.findById(notificationId);
  if (!notif) throw new NotFoundError('Notification not found');
  if (notif.userId !== userId) throw new ForbiddenError('You cannot access this notification');

  return repository.markAsRead(notificationId, userId);
}

/** Menandai semua notifikasi milik user sebagai sudah dibaca. */
export async function markAllAsRead(userId: string) {
  await repository.markAllAsRead(userId);
}

/**
 * Menghapus satu notifikasi milik user.
 * @throws NotFoundError jika notifikasi tidak ada.
 * @throws ForbiddenError jika notifikasi bukan milik user tersebut.
 */
export async function deleteNotification(userId: string, notificationId: string) {
  const notif = await repository.findById(notificationId);
  if (!notif) throw new NotFoundError('Notification not found');
  if (notif.userId !== userId) throw new ForbiddenError('You cannot access this notification');

  await repository.deleteById(notificationId, userId);
}

/** Menghapus seluruh notifikasi milik user dan mengembalikan jumlah terhapus. */
export async function deleteAllNotifications(userId: string) {
  const deleted = await repository.deleteAll(userId);
  return { deleted };
}
