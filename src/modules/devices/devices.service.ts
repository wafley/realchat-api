/**
 * Layanan logika bisnis perangkat: registrasi/penghapusan subscription id milik
 * user dan fan-out push notification untuk pesan masuk dengan menyaring penerima
 * yang memblokir pengirim, sedang mode mute, atau mematikan notifikasi pesan.
 */
import * as repository from './devices.repository';
import { sendPush, messagePreview } from './onesignal.service';
import { getBlockRelationUserIds } from '../users/blockedUsers.repository';
import { findNewMessageOptOuts } from '../users/users.repository';

// Batas jumlah token per user; token terlama akan dipangkas saat registrasi baru.
const MAX_DEVICE_TOKENS_PER_USER = 10;

/**
 * Mendaftarkan (atau memperbarui) subscription id OneSignal milik user, lalu
 * memangkas subscription terlama bila melebihi batas maksimum per user.
 */
export async function registerDevice(
  userId: string,
  data: { token: string; platform: 'android' | 'web' },
) {
  const row = await repository.upsertDeviceToken(userId, data.token, data.platform);
  await repository.trimTokensForUser(userId, MAX_DEVICE_TOKENS_PER_USER);
  return row;
}

/** Menghapus satu token perangkat milik user (mis. saat logout). */
export async function unregisterDevice(userId: string, token: string) {
  await repository.removeDeviceToken(userId, token);
}

/** Kandidat penerima push beserta status mute-nya. */
export interface PushTarget {
  userId: string;
  mutedUntil: Date | null;
}

/**
 * Mengirim push notification untuk pesan masuk ke seluruh kandidat penerima.
 * Penerima disaring: bukan pengirim sendiri, tidak memblokir (atau diblokir
 * oleh) pengirim, dan tidak sedang mute. Pengiriman memakai external id
 * (user.id aplikasi) sehingga menyasar identity pengguna, bukan per-perangkat.
 * Kegagalan push tidak boleh mengganggu alur utama, sehingga ditangkap dan
 * hanya dicatat sebagai error.
 */
export async function sendIncomingPush(options: {
  conversationId: string;
  conversationType: string;
  conversationName: string | null;
  messageId: string;
  senderId: string;
  senderName: string;
  content: string;
  targets: PushTarget[];
}) {
  try {
    // Saring penerima: buang pengirim, user yang saling memblokir dengan
    // pengirim, user yang masih dalam masa mute (mutedUntil di masa depan),
    // dan user yang mematikan push pesan masuk lewat preferensi notifikasi.
    const blockedWithSender = new Set(await getBlockRelationUserIds(options.senderId));
    const optedOut = await findNewMessageOptOuts(options.targets.map((t) => t.userId));
    const recipients = options.targets.filter(
      (t) =>
        t.userId !== options.senderId &&
        !blockedWithSender.has(t.userId) &&
        !optedOut.has(t.userId) &&
        (!t.mutedUntil || t.mutedUntil.getTime() <= Date.now()),
    );
    if (recipients.length === 0) return;

    // Judul push: untuk grup tampilkan "pengirim @ nama grup", untuk DM nama pengirim.
    const isGroup = options.conversationType === 'GROUP';
    const title = isGroup
      ? `${options.senderName} @ ${options.conversationName || 'Group'}`
      : options.senderName;

    await sendPush(
      recipients.map((r) => r.userId),
      {
        title,
        body: messagePreview(options.content),
        data: {
          conversationId: options.conversationId,
          messageId: options.messageId,
          type: isGroup ? 'group' : 'dm',
          senderId: options.senderId,
          senderName: options.senderName,
          url: isGroup
            ? `/chat/${options.conversationId}`
            : `/dm/${options.conversationId}`,
        },
      },
    );
  } catch (err) {
    console.error('[push] sendIncomingPush failed:', err);
  }
}
