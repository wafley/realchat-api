import * as repository from './contacts.repository';
import { findUserById, findUserByUsername } from '../auth/auth.repository';
import { NotFoundError, ConflictError, BadRequestError } from '../../utils/errors';
import { getIO } from '../../socket/index';
import { createAndEmit } from '../notifications/notifications.service';

async function insertContactAndNotify(myId: string, targetUserId: string, customName?: string) {
  const contact = await repository.addContact(myId, targetUserId, customName);

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

export async function addContactByUsername(myId: string, username: string, customName?: string) {
  const target = await findUserByUsername(username);
  if (!target) throw new NotFoundError('User not found');
  if (target.id === myId) throw new BadRequestError('Cannot add yourself');

  const existing = await repository.findContact(myId, target.id);
  if (existing) throw new ConflictError('User is already your contact');

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

  return repository.addContactsBulk(myId, uniqueIds);
}

export async function getMyContacts(userId: string, sort?: string, search?: string) {
  return repository.findContacts(userId, sort, search);
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
