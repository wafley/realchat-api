import { initializeApp, getApps, cert, applicationDefault } from 'firebase-admin/app';
import { getMessaging as getAdminMessaging } from 'firebase-admin/messaging';
import type { Messaging } from 'firebase-admin/messaging';
import { env } from './env';

let messagingPromise: Promise<Messaging | null> | null = null;

export function getMessaging(): Promise<Messaging | null> {
  if (!messagingPromise) {
    messagingPromise = initMessaging().catch((err) => {
      console.error('[push] firebase init failed:', err);
      messagingPromise = null;
      return null;
    });
  }
  return messagingPromise;
}

async function initMessaging(): Promise<Messaging | null> {
  const raw = env.firebaseServiceAccount;
  if (raw) {
    const credential = raw.trim().startsWith('{') ? cert(JSON.parse(raw)) : cert(raw);
    if (getApps().length === 0) initializeApp({ credential });
    return getAdminMessaging();
  }

  if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) return null;
  if (getApps().length === 0) initializeApp({ credential: applicationDefault() });
  return getAdminMessaging();
}
