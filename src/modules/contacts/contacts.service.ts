/**
 * Logika bisnis kontak: tambah (per username/massal), hapus, ubah nama
 * kustom, cek status kontak, dan relasi dua arah. Setiap penambahan memicu
 * notifikasi dan event socket 'contact:new' ke pengguna yang ditambahkan.
 */
import * as repository from './contacts.repository';
import { findUserById, findUserByUsername, findUsersByIds } from '../auth/auth.repository';
import { NotFoundError, ConflictError, BadRequestError, ForbiddenError } from '../../utils/errors';
import { getIO } from '../../socket/index';
import { hasBlockRelation, getBlockRelationUserIds } from '../users/blockedUsers.repository';
import { findPresenceTargets } from '../users/users.repository';
import { filterVisiblePresenceIds } from '../users/presencePrivacy';
import type { CreateNotificationData } from '../notifications/notifications.repository';

/** Data ringkas aktor (pemilik kontak) untuk isi notifikasi dan event socket. */
type ContactActor = { username: string | null; fullName: string | null; avatarUrl: string | null };

/** Menyusun data notifikasi 'Kontak Baru' untuk pengguna yang ditambahkan. */
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

/** Mengirim event socket 'contact:new' ke pengguna yang baru ditambahkan. */
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

/** Menyimpan kontak + notifikasi lewat repository lalu menyiarkan event socket. */
async function insertContactAndNotify(myId: string, targetUserId: string, customName?: string) {
  const me = await findUserById(myId);
  const contact = await repository.addContactAndNotify(myId, targetUserId, customName, [
    buildContactNotification(myId, targetUserId, me),
  ]);
  emitContactAdded(myId, targetUserId, me);
  return contact;
}

/**
 * Menambahkan kontak berdasarkan username target.
 * @throws NotFoundError jika username tidak terdaftar
 * @throws BadRequestError jika menambahkan diri sendiri
 * @throws ConflictError jika sudah menjadi kontak
 * @throws ForbiddenError jika ada relasi blokir di antara kedua pengguna
 */
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

/**
 * Menghapus kontak dari daftar milik sendiri dan memberi tahu pihak lain
 * lewat event socket 'contact:remove'.
 */
export async function removeContact(myId: string, targetUserId: string) {
  if (myId === targetUserId) return;

  await repository.removeContact(myId, targetUserId);

  getIO().to(`user:${targetUserId}`).emit('contact:remove', { userId: myId });
}

/**
 * Mengubah nama kustom kontak milik sendiri.
 * @throws NotFoundError jika relasi kontak tidak ditemukan
 */
export async function updateContactCustomName(
  myId: string,
  targetUserId: string,
  customName: string,
) {
  const existing = await repository.findContact(myId, targetUserId);
  if (!existing) throw new NotFoundError('Contact not found');

  return repository.updateContactCustomName(myId, targetUserId, customName);
}

/**
 * Menambahkan banyak kontak sekaligus: deduplikasi ID, validasi keberadaan
 * semua target, tolak jika ada relasi blokir, lalu simpan dan notifikasi.
 * @throws NotFoundError jika ada ID yang tidak terdaftar
 * @throws ForbiddenError jika ada target yang berrelasi blokir
 */
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

/**
 * Mengambil daftar kontak milik pengguna. Kehadiran (isOnline/lastSeenAt)
 * disembunyikan untuk kontak yang berrelasi blokir atau yang kebijakan
 * privasinya tidak mengizinkan pengguna melihat.
 */
export async function getMyContacts(userId: string, sort?: string, search?: string) {
  const rows = await repository.findContacts(userId, sort, search);
  const blockedIds = new Set(await getBlockRelationUserIds(userId));

  // Kebijakan privasi semua kontak dicek sekaligus (satu query).
  const targetMap = new Map(
    (await findPresenceTargets(rows.map((r) => r.id))).map((t) => [t.id, t]),
  );
  const visibleIds = await filterVisiblePresenceIds(userId, targetMap);

  return rows.map((row) => {
    const presenceHidden = blockedIds.has(row.id) || !visibleIds.has(row.id);
    return {
      ...row,
      isOnline: presenceHidden ? null : row.isOnline,
      lastSeenAt: presenceHidden ? null : row.lastSeenAt,
    };
  });
}

/**
 * Memeriksa apakah target adalah kontak milik sendiri. Selalu false untuk
 * diri sendiri maupun jika ada relasi blokir.
 */
export async function checkContact(myId: string, targetUserId: string) {
  if (myId === targetUserId) return false;
  if (await hasBlockRelation(myId, targetUserId)) return false;

  const contact = await repository.findContact(myId, targetUserId);
  return Boolean(contact);
}

/**
 * Menentukan status relasi dua arah: 'mutual' (saling kontak), 'added'
 * (saya menambahkan), 'added_you' (ditambahkan oleh mereka), 'none', atau
 * null untuk diri sendiri. Blokir dua arah selalu menghasilkan 'none'.
 */
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
