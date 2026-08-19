import * as repository from './contacts.repository';
import { findUserById, findUserByUsername, findUsersByIds } from '../auth/auth.repository';
import { NotFoundError, ConflictError, BadRequestError, ForbiddenError } from '../../utils/errors';
import { getIO } from '../../socket/index';
import { hasBlockRelation, getBlockRelationUserIds } from '../users/blockedUsers.repository';
import type { CreateNotificationData } from '../notifications/notifications.repository';

type ContactActor = { username: string | null; fullName: string | null; avatarUrl: string | null };

function buildContactNotification(
  myId: string,
  targetUserId: string,
  me: ContactActor | null,
): CreateNotificationData {
  return {
    userId: targetUserId,
    type: 'new_contact',
    actorId: myId,
    title: 'Kontak Baru',
    body: `@${me?.username || 'Someone'} menambahkan Anda sebagai kontak`,
  };
}

function emitContactAdded(myId: string, targetUserId: string, me: ContactActor | null) {
  getIO()
    .to(`user:${targetUserId}`)
    .emit('contact:new', {
      contact: {
        id: myId,
        username: me?.username,
        fullName: me?.fullName,
        avatarUrl: me?.avatarUrl,
      },
    });
}

async function insertContactAndNotify(myId: string, targetUserId: string, customName?: string) {
  const me = await findUserById(myId);
  const contact = await repository.addContactAndNotify(myId, targetUserId, customName, [
    buildContactNotification(myId, targetUserId, me),
  ]);
  emitContactAdded(myId, targetUserId, me);
  return contact;
}

export async function addContactByUsername(myId: string, username: string, customName?: string) {
  const target = await findUserByUsername(username);
  if (!target) throw new NotFoundError('User not found');
  if (target.id === myId) throw new BadRequestError('Cannot add yourself');

  const existing = await repository.findContact(myId, target.id);
  if (existing) throw new ConflictError('User is already your contact');

  if (await hasBlockRelation(myId, target.id)) {
    throw new ForbiddenError('You cannot add a user you have blocked or who has blocked you');
  }

  return insertContactAndNotify(myId, target.id, customName);
}

export async function removeContact(myId: string, targetUserId: string) {
  if (myId === targetUserId) return;

  await repository.removeContact(myId, targetUserId);

  getIO().to(`user:${targetUserId}`).emit('contact:remove', { userId: myId });
}

export async function updateContactCustomName(
  myId: string,
  targetUserId: string,
  customName: string,
) {
  const existing = await repository.findContact(myId, targetUserId);
  if (!existing) throw new NotFoundError('Contact not found');

  return repository.updateContactCustomName(myId, targetUserId, customName);
}

export async function addContactsBulk(myId: string, targetUserIds: string[]) {
  const uniqueIds = [...new Set(targetUserIds)].filter((id) => id !== myId);
  if (uniqueIds.length === 0) return [];

  const found = await findUsersByIds(uniqueIds);
  if (found.length !== uniqueIds.length) {
    throw new NotFoundError('Some users do not exist');
  }

  const blockedTargets = new Set(await getBlockRelationUserIds(myId));
  if (uniqueIds.some((id) => blockedTargets.has(id))) {
    throw new ForbiddenError('You cannot add a user you have blocked or who has blocked you');
  }

  const me = await findUserById(myId);
  const contacts = await repository.addContactsBulkAndNotify(
    myId,
    uniqueIds,
    uniqueIds.map((id) => buildContactNotification(myId, id, me)),
  );

  for (const contact of contacts) {
    emitContactAdded(myId, contact.contactId, me);
  }

  return contacts;
}

export async function getMyContacts(userId: string, sort?: string, search?: string) {
  const rows = await repository.findContacts(userId, sort, search);
  const blockedIds = new Set(await getBlockRelationUserIds(userId));
  return rows.map((row) => ({
    ...row,
    isOnline: blockedIds.has(row.id) ? null : row.isOnline,
    lastSeenAt: blockedIds.has(row.id) ? null : row.lastSeenAt,
  }));
}

export async function checkContact(myId: string, targetUserId: string) {
  if (myId === targetUserId) return false;
  if (await hasBlockRelation(myId, targetUserId)) return false;

  const contact = await repository.findContact(myId, targetUserId);
  return Boolean(contact);
}

export async function getRelationship(myId: string, targetUserId: string) {
  if (myId === targetUserId) return null;
  if (await hasBlockRelation(myId, targetUserId)) return 'none';

  const [iHaveThem, theyHaveMe] = await Promise.all([
    repository.findContact(myId, targetUserId),
    repository.findContact(targetUserId, myId),
  ]);

  if (iHaveThem && theyHaveMe) return 'mutual';
  if (iHaveThem) return 'added';
  if (theyHaveMe) return 'added_you';
  return 'none';
}
