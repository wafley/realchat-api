import * as repository from './devices.repository';
import { sendPush, messagePreview } from './fcm.service';
import { getBlockRelationUserIds } from '../users/blockedUsers.repository';

const MAX_DEVICE_TOKENS_PER_USER = 10;

export async function registerDevice(
  userId: string,
  data: { token: string; platform: 'android' | 'web' },
) {
  const row = await repository.upsertDeviceToken(userId, data.token, data.platform);
  await repository.trimTokensForUser(userId, MAX_DEVICE_TOKENS_PER_USER);
  return row;
}

export async function unregisterDevice(userId: string, token: string) {
  await repository.removeDeviceToken(userId, token);
}

export interface PushTarget {
  userId: string;
  mutedUntil: Date | null;
}

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
    const blockedWithSender = new Set(await getBlockRelationUserIds(options.senderId));
    const recipients = options.targets.filter(
      (t) =>
        t.userId !== options.senderId &&
        !blockedWithSender.has(t.userId) &&
        (!t.mutedUntil || t.mutedUntil.getTime() <= Date.now()),
    );
    if (recipients.length === 0) return;

    const tokens = await repository.findTokensByUserIds(recipients.map((r) => r.userId));
    if (tokens.length === 0) return;

    const isGroup = options.conversationType === 'GROUP';
    const title = isGroup
      ? `${options.senderName} @ ${options.conversationName || 'Group'}`
      : options.senderName;

    await sendPush(
      tokens.map((t) => t.token),
      {
        title,
        body: messagePreview(options.content),
        data: {
          conversationId: options.conversationId,
          messageId: options.messageId,
          type: isGroup ? 'group' : 'dm',
          senderId: options.senderId,
          senderName: options.senderName,
        },
      },
    );
  } catch (err) {
    console.error('[push] sendIncomingPush failed:', err);
  }
}
