import { initializeApp, cert } from 'firebase-admin/app';
import { getMessaging as getAdminMessaging } from 'firebase-admin/messaging';
import type { Messaging } from 'firebase-admin/messaging';
import { env } from './env';

let messaging: Messaging | null | undefined;

export function getMessaging(): Messaging | null {
  if (messaging !== undefined) return messaging;

  const raw = env.firebaseServiceAccount;
  if (!raw) {
    messaging = null;
    return null;
  }

  const credential = raw.trim().startsWith('{') ? cert(JSON.parse(raw)) : cert(raw);

  initializeApp({ credential });
  messaging = getAdminMessaging();
  return messaging;
}
