/**
 * Layanan pengiriman push notification via OneSignal.
 * Mengirim pesan ke satu atau banyak external user id (user.id dari aplikasi),
 * sehingga semua perangkat milik user yang sama akan menerima notifikasi.
 * Menyediakan mode dry-run untuk lingkungan non-produksi (hanya log payload).
 */
import { env } from '../../config/env';
import { isOneSignalConfigured, sendOneSignalNotification } from '../../config/onesignal';

/** Data kustom yang disisipkan ke payload push agar client bisa navigasi. */
export interface PushData extends Record<string, string> {
  conversationId: string;
  messageId: string;
  type: 'dm' | 'group';
  senderId: string;
  senderName: string;
}

/** Payload lengkap push notification: judul, isi, dan data kustom. */
export interface PushPayload {
  title: string;
  body: string;
  data: PushData;
}

/** Memotong isi pesan menjadi pratinjau maksimal 100 karakter (dengan elipsis). */
export function messagePreview(content: string): string {
  const trimmed = content.trim();
  return trimmed.length > 100 ? `${trimmed.slice(0, 97)}…` : trimmed;
}

/** Jeda asinkron sederhana, dipakai untuk mensimulasikan latihan kirim di dry-run. */
function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Mengirim push notification ke sekumpulan external user id (user.id aplikasi).
 * Di luar produksi hanya mencetak payload (dry-run); di produksi mengirim ke
 * OneSignal REST API via include_aliases.external_id.
 *
 * @param externalUserIds - ID user (external_id) tujuan pengiriman.
 * @param payload - Judul, isi, dan data kustom pesan.
 */
export async function sendPush(externalUserIds: string[], payload: PushPayload) {
  if (externalUserIds.length === 0) return;

  // Jika kredensial OneSignal belum tersedia, jangan gagalkan alur utama:
  // cukup cetak payload (dry-run) sebagai pengganti kiriman sebenarnya.
  if (!isOneSignalConfigured()) {
    if (env.pushDryRunDelayMs > 0) await sleep(env.pushDryRunDelayMs);
    console.log(
      `[push:dry-run] to=${externalUserIds.length} users payload=${JSON.stringify(payload)}`,
    );
    return;
  }

  try {
    const result = await sendOneSignalNotification({
      app_id: env.oneSignalAppId,
      include_aliases: { external_id: externalUserIds },
      target_channel: 'push',
      isAnyWeb: true,
      contents: { en: payload.body },
      headings: { en: payload.title },
      data: payload.data,
    });

    if (!result.id && result.errors) {
      // Tidak ada penerima yang bisa dijangkau / error lain; log saja.
      console.warn(
        '[push] onesignal no recipient / partial errors:',
        JSON.stringify(result.errors),
      );
    }
  } catch (err) {
    console.error('[push] sendPush failed:', err);
  }
}
