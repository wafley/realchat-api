/**
 * Konfigurasi OneSignal untuk push notification.
 * Membaca ONESIGNAL_APP_ID dan ONESIGNAL_REST_API_KEY dari env.
 * Bila tidak diisi, push dinonaktifkan dengan aman (isOneSignalConfigured() == false).
 */
import { env } from './env';

const ONESIGNAL_API_URL = 'https://api.onesignal.com/notifications';

/** Memeriksa apakah kredensial OneSignal sudah tersedia untuk mengirim push. */
export function isOneSignalConfigured(): boolean {
  return Boolean(env.oneSignalAppId && env.oneSignalRestApiKey);
}

/**
 * Mengirim satu request push notification ke OneSignal REST API.
 * Menggunakan global fetch (Node 18+) sehingga tidak butuh dependency ekstra.
 *
 * @param body - Body request (app_id, include_aliases, contents, headings, data, dst).
 * @returns Respons JSON dari OneSignal.
 */
export async function sendOneSignalNotification(body: Record<string, unknown>): Promise<{
  id?: string;
  errors?: unknown;
  recipients?: number;
}> {
  if (!isOneSignalConfigured()) {
    throw new Error('OneSignal is not configured');
  }

  const response = await fetch(ONESIGNAL_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Key ${env.oneSignalRestApiKey}`,
    },
    body: JSON.stringify(body),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`OneSignal request failed (${response.status}): ${JSON.stringify(data)}`);
  }
  return data;
}
