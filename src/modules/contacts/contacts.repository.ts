import db from '../../db/index';
import { contacts } from '../../db/schema/contacts';
import { eq, and, desc, inArray } from 'drizzle-orm';

export const contactColumns = {
  id: contacts.id,
  userId: contacts.userId,
  contactId: contacts.contactId,
  createdAt: contacts.createdAt,
};

export async function addContact(userId: string, contactId: string) {
  const existing = await findContact(userId, contactId);
  if (existing) return existing;

  const [contact] = await db
    .insert(contacts)
    .values({ userId, contactId })
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

export async function findContact(userId: string, contactId: string) {
  const [contact] = await db
    .select(contactColumns)
    .from(contacts)
    .where(and(eq(contacts.userId, userId), eq(contacts.contactId, contactId)))
    .limit(1);
  return contact || null;
}

export async function findContacts(userId: string, sort?: string) {
  const query = db.select(contactColumns).from(contacts).where(eq(contacts.userId, userId));

  if (sort === 'alphabetical') {
    return query;
  }
  return query.orderBy(desc(contacts.createdAt));
}

export async function findContactIds(userId: string) {
  const rows = await db
    .select({ id: contacts.contactId })
    .from(contacts)
    .where(eq(contacts.userId, userId));
  return rows.map((r) => r.id);
}
