import db from '../../db/index';
import { contacts } from '../../db/schema/contacts';
import { users } from '../../db/schema/users';
import { eq, and, desc, asc, inArray, ilike, or } from 'drizzle-orm';

const contactColumns = {
  id: contacts.id,
  userId: contacts.userId,
  contactId: contacts.contactId,
  customName: contacts.customName,
  createdAt: contacts.createdAt,
};

export async function addContact(userId: string, contactId: string, customName?: string) {
  const existing = await findContact(userId, contactId);
  if (existing) return existing;

  const [contact] = await db
    .insert(contacts)
    .values({ userId, contactId, customName })
    .returning(contactColumns);
  return contact;
}

export async function addContactsBulk(userId: string, contactIds: string[]) {
  const existing = await db
    .select({ contactId: contacts.contactId })
    .from(contacts)
    .where(and(eq(contacts.userId, userId), inArray(contacts.contactId, contactIds)));

  const existingIds = new Set(existing.map((row) => row.contactId));
  const newIds = contactIds.filter((id) => !existingIds.has(id));

  if (newIds.length === 0) return [];

  return db
    .insert(contacts)
    .values(newIds.map((contactId) => ({ userId, contactId })))
    .returning(contactColumns);
}

export async function removeContact(userId: string, contactId: string) {
  await db
    .delete(contacts)
    .where(and(eq(contacts.userId, userId), eq(contacts.contactId, contactId)));
}

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

export async function findContact(userId: string, contactId: string) {
  const [contact] = await db
    .select(contactColumns)
    .from(contacts)
    .where(and(eq(contacts.userId, userId), eq(contacts.contactId, contactId)))
    .limit(1);
  return contact || null;
}

export async function findContacts(userId: string, sort?: string, search?: string) {
  const conditions = [eq(contacts.userId, userId)];

  if (search) {
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
