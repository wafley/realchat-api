/**
 * Layanan pengiriman push notification via Firebase Cloud Messaging (FCM).
 * Mengirim pesan multicast per batch token, membersihkan token yang tidak
 * valid/kadaluarsa, dan menyediakan mode dry-run untuk lingkungan non-produksi.
 */
import { getMessaging } from '../../config/firebase';
import { env } from '../../config/env';
import * as repository from './devices.repository';
import type { SendResponse } from 'firebase-admin/messaging';

// Jumlah token maksimum per permintaan multicast (batas FCM adalah 500).
const BATCH_SIZE = 500;

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
 * Mengirim push notification ke sekumpulan token perangkat.
 * Di luar produksi hanya mencetak payload (dry-run); di produksi mengirim
 * multicast per batch dan menghapus token yang sudah tidak terdaftar.
 * @param tokens - Token FCM tujuan pengiriman.
 * @param payload - Judul, isi, dan data kustom pesan.
 */
export async function sendPush(tokens: string[], payload: PushPayload) {
  if (tokens.length === 0) return;

  // Mode dry-run: tidak benar-benar mengirim, hanya log dengan jeda opsional
  // agar perilaku asinkron bisa diuji di lingkungan development/test.
  if (env.nodeEnv !== 'production') {
    if (env.pushDryRunDelayMs > 0) await sleep(env.pushDryRunDelayMs);
    console.log(`[push:dry-run] to=${tokens.length} tokens payload=${JSON.stringify(payload)}`);
    return;
  }

  const messaging = await getMessaging();
  if (!messaging) {
    console.warn('[push] firebase not configured, skipping push');
    return;
  }

  const invalidTokens: string[] = [];
  // Kirim per batch karena FCM membatasi jumlah token per permintaan multicast.
  for (let i = 0; i < tokens.length; i += BATCH_SIZE) {
    const batch = tokens.slice(i, i + BATCH_SIZE);
    const result = await messaging.sendEachForMulticast({
      tokens: batch,
      notification: { title: payload.title, body: payload.body },
      data: payload.data,
    });
    // Token yang gagal terdaftar (uninstall/kadaluarsa) dikumpulkan untuk dihapus.
    result.responses.forEach((entry: SendResponse, index: number) => {
      if (entry.error?.code === 'messaging/registration-token-not-registered') {
        invalidTokens.push(batch[index]);
      }
    });
  }

  // Bersihkan token tidak valid agar pengiriman berikutnya lebih efisien.
  if (invalidTokens.length > 0) {
    await repository.removeDeviceTokens(invalidTokens);
  }
}
