/**
 * Lapisan akses data kontak: tambah (tunggal/massal) beserta notifikasi dalam
 * satu transaksi, hapus, ubah nama kustom, dan pencarian daftar kontak
 * dengan filter serta pengurutan.
 */
import db from '../../db/index';
import { contacts } from '../../db/schema/contacts';
import { users } from '../../db/schema/users';
import { notifications } from '../../db/schema/notifications';
import { eq, and, desc, asc, inArray, ilike, or } from 'drizzle-orm';
import type { CreateNotificationData } from '../notifications/notifications.repository';

/** Kolom kontak yang dikembalikan oleh query pada file ini. */
const contactColumns = {
  id: contacts.id,
  userId: contacts.userId,
  contactId: contacts.contactId,
  customName: contacts.customName,
  createdAt: contacts.createdAt,
};

/**
 * Menambahkan satu kontak beserta notifikasinya dalam satu transaksi agar
 * kontak dan notifikasi selalu konsisten.
 */
export async function addContactAndNotify(
  userId: string,
  contactId: string,
  customName: string | undefined,
  notificationsData: CreateNotificationData[],
) {
  return db.transaction(async (tx) => {
    const [contact] = await tx
      .insert(contacts)
      .values({ userId, contactId, customName })
      .returning(contactColumns);
    if (notificationsData.length > 0) {
      await tx.insert(notifications).values(notificationsData);
    }
    return contact;
  });
}

/**
 * Menambahkan banyak kontak sekaligus dalam satu transaksi: kontak yang
 * sudah ada dilewati, dan notifikasi hanya dibuat untuk kontak baru.
 */
export async function addContactsBulkAndNotify(
  userId: string,
  contactIds: string[],
  notificationsData: CreateNotificationData[],
) {
  return db.transaction(async (tx) => {
    const existing = await tx
      .select({ contactId: contacts.contactId })
      .from(contacts)
      .where(and(eq(contacts.userId, userId), inArray(contacts.contactId, contactIds)));
    const existingIds = new Set(existing.map((row) => row.contactId));
    const newIds = contactIds.filter((id) => !existingIds.has(id));

    const inserted =
      newIds.length > 0
        ? await tx
            .insert(contacts)
            .values(newIds.map((contactId) => ({ userId, contactId })))
            .returning(contactColumns)
        : [];

    const notificationsForNew = notificationsData.filter((n) => newIds.includes(n.userId));
    if (notificationsForNew.length > 0) {
      await tx.insert(notifications).values(notificationsForNew);
    }

    return inserted;
  });
}

/** Menghapus relasi kontak dari sisi pemilik (userId). */
export async function removeContact(userId: string, contactId: string) {
  await db
    .delete(contacts)
    .where(and(eq(contacts.userId, userId), eq(contacts.contactId, contactId)));
}

/** Memperbarui nama kustom kontak; null jika relasi kontak tidak ada. */
export async function updateContactCustomName(
  userId: string,
  contactId: string,
  customName: string,
) {
  const [contact] = await db
    .update(contacts)
    .set({ customName })
    .where(and(eq(contacts.userId, userId), eq(contacts.contactId, contactId)))
    .returning(contactColumns);
  return contact || null;
}

/** Mencari satu relasi kontak spesifik milik userId; null jika tidak ada. */
export async function findContact(userId: string, contactId: string) {
  const [contact] = await db
    .select(contactColumns)
    .from(contacts)
    .where(and(eq(contacts.userId, userId), eq(contacts.contactId, contactId)))
    .limit(1);
  return contact || null;
}

/**
 * Mengambil daftar kontak lengkap dengan profil penggunanya. Mendukung
 * pencarian (username/nama/nama kustom, case-insensitive) dan pengurutan
 * alfabetis; default diurutkan dari kontak terbaru.
 */
export async function findContacts(userId: string, sort?: string, search?: string) {
  const conditions = [eq(contacts.userId, userId)];

  if (search) {
    // Escape wildcard LIKE agar input pengguna tidak menjadi pola liar.
    const escaped = search.replace(/[\\%_]/g, '\\$&');
    const pattern = `%${escaped}%`;
    conditions.push(
      or(
        ilike(users.username, pattern),
        ilike(users.fullName, pattern),
        ilike(contacts.customName, pattern),
      )!,
    );
  }

  const query = db
    .select({
      id: users.id,
      username: users.username,
      fullName: users.fullName,
      avatarUrl: users.avatarUrl,
      bio: users.bio,
      isOnline: users.isOnline,
      lastSeenAt: users.lastSeenAt,
      customName: contacts.customName,
      createdAt: contacts.createdAt,
    })
    .from(contacts)
    .innerJoin(users, eq(users.id, contacts.contactId))
    .where(and(...conditions));

  if (sort === 'alphabetical') {
    return query.orderBy(asc(users.username));
  }
  return query.orderBy(desc(contacts.createdAt));
}
