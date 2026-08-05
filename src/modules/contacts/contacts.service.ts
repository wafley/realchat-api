import * as repository from './contacts.repository';
import { findUserById } from '../auth/auth.repository';
import { NotFoundError } from '../../utils/errors';
import { getIO } from '../../socket/index';
import { createAndEmit } from '../notifications/notifications.service';

export async function addContact(myId: string, targetUserId: string) {
  if (myId === targetUserId) return null;

  const target = await findUserById(targetUserId);
  if (!target) throw new NotFoundError('User not found');

  const contact = await repository.addContact(myId, targetUserId);

  const me = await findUserById(myId);

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

  await createAndEmit({
    userId: targetUserId,
    type: 'new_contact',
    actorId: myId,
    title: 'Kontak Baru',
    body: `@${me?.username || 'Someone'} menambahkan Anda sebagai kontak`,
  });

  return contact;
}

export async function removeContact(myId: string, targetUserId: string) {
  if (myId === targetUserId) return;

  await repository.removeContact(myId, targetUserId);

  getIO().to(`user:${targetUserId}`).emit('contact:remove', { userId: myId });
}

export async function addContactsBulk(myId: string, targetUserIds: string[]) {
  const uniqueIds = [...new Set(targetUserIds)].filter((id) => id !== myId);
  if (uniqueIds.length === 0) return [];

  return repository.addContactsBulk(myId, uniqueIds);
}

async function attachUserDetails(rows: { userId: string; contactId: string }[]) {
  const result = [];
  for (const row of rows) {
    const user = await findUserById(row.contactId);
    if (user) {
      result.push({
        id: user.id,
        username: user.username,
        fullName: user.fullName,
        avatarUrl: user.avatarUrl,
        bio: user.bio,
        isOnline: user.isOnline,
        lastSeenAt: user.lastSeenAt,
      });
    }
  }
  return result;
}

export async function getMyContacts(userId: string, sort?: string) {
  const rows = await repository.findContacts(userId, sort);
  return attachUserDetails(rows);
}

export async function checkContact(myId: string, targetUserId: string) {
  if (myId === targetUserId) return false;

  const contact = await repository.findContact(myId, targetUserId);
  return Boolean(contact);
}

export async function getRelationship(myId: string, targetUserId: string) {
  if (myId === targetUserId) return null;

  const [iHaveThem, theyHaveMe] = await Promise.all([
    repository.findContact(myId, targetUserId),
    repository.findContact(targetUserId, myId),
  ]);

  if (iHaveThem && theyHaveMe) return 'mutual';
  if (iHaveThem) return 'added';
  if (theyHaveMe) return 'added_you';
  return 'none';
}
