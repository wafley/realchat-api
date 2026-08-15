import { getMessaging } from '../../config/firebase';
import { env } from '../../config/env';
import * as repository from './devices.repository';
import type { SendResponse } from 'firebase-admin/messaging';

const BATCH_SIZE = 500;

export interface PushData extends Record<string, string> {
  conversationId: string;
  messageId: string;
  type: 'dm' | 'group';
  senderId: string;
  senderName: string;
}

export interface PushPayload {
  title: string;
  body: string;
  data: PushData;
}

export function messagePreview(content: string): string {
  const trimmed = content.trim();
  return trimmed.length > 100 ? `${trimmed.slice(0, 97)}…` : trimmed;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function sendPush(tokens: string[], payload: PushPayload) {
  if (tokens.length === 0) return;

  if (env.nodeEnv !== 'production') {
    if (env.pushDryRunDelayMs > 0) await sleep(env.pushDryRunDelayMs);
    console.log(`[push:dry-run] to=${tokens.length} tokens payload=${JSON.stringify(payload)}`);
    return;
  }

  const messaging = getMessaging();
  if (!messaging) {
    console.warn('[push] firebase not configured, skipping push');
    return;
  }

  const invalidTokens: string[] = [];
  for (let i = 0; i < tokens.length; i += BATCH_SIZE) {
    const batch = tokens.slice(i, i + BATCH_SIZE);
    const result = await messaging.sendEachForMulticast({
      tokens: batch,
      notification: { title: payload.title, body: payload.body },
      data: payload.data,
    });
    result.responses.forEach((entry: SendResponse, index: number) => {
      if (entry.error?.code === 'messaging/registration-token-not-registered') {
        invalidTokens.push(batch[index]);
      }
    });
  }

  if (invalidTokens.length > 0) {
    await repository.removeDeviceTokens(invalidTokens);
  }
}
