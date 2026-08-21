/**
 * Aturan visibilitas kehadiran (isOnline/lastSeenAt) berbasis pengaturan
 * privasi pemilik data. Helper ini hanya mengevaluasi kebijakan privasi;
 * relasi blokir ditangani pemanggil karena blokir selalu menang.
 */
import db from '../../db/index';
import { contacts } from '../../db/schema/contacts';
import { eq, and, inArray } from 'drizzle-orm';

/** Target pemeriksaan visibilitas: id pemilik setting beserta nilainya. */
export interface PresenceTarget {
  id: string;
  lastSeenVisibility: string;
}

/**
 * Menentukan apakah viewer boleh melihat kehadiran target berdasarkan
 * kebijakan privasi target saja. Dirinya sendiri selalu boleh melihat.
 */
export async function canSeePresence(viewerId: string, target: PresenceTarget): Promise<boolean> {
  if (viewerId === target.id) return true;
  if (target.lastSeenVisibility === 'EVERYONE') return true;
  if (target.lastSeenVisibility === 'NOBODY') return false;
  // Kebijakan CONTACTS: viewer harus tersimpan sebagai kontak milik target.
  const [row] = await db
    .select({ id: contacts.id })
    .from(contacts)
    .where(and(eq(contacts.userId, target.id), eq(contacts.contactId, viewerId)))
    .limit(1);
  return !!row;
}

/**
 * Versi batch dari canSeePresence untuk penyaringan daftar: mengembalikan
 * himpunan id target yang kehadirannya boleh dilihat viewer. Query kontak
 * hanya dijalankan bila ada target berkebijakan CONTACTS.
 */
export async function filterVisiblePresenceIds(
  viewerId: string,
  targets: Map<string, PresenceTarget>,
): Promise<Set<string>> {
  const visible = new Set<string>();
  const needContactCheck: string[] = [];
  for (const [id, target] of targets) {
    if (viewerId === id || target.lastSeenVisibility === 'EVERYONE') {
      visible.add(id);
    } else if (target.lastSeenVisibility === 'CONTACTS') {
      needContactCheck.push(id);
    }
  }
  if (needContactCheck.length > 0) {
    const rows = await db
      .select({ userId: contacts.userId })
      .from(contacts)
      .where(and(inArray(contacts.userId, needContactCheck), eq(contacts.contactId, viewerId)));
    for (const row of rows) visible.add(row.userId);
  }
  return visible;
}
