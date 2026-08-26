/**
 * Utilitas reset status presence di database. Dipakai saat startup server
 * agar flag isOnline basi dari sesi sebelumnya tidak tertinggal.
 */
import { eq } from 'drizzle-orm';
import db from '../db/index';
import { users } from '../db/schema/users';

/** Menandai seluruh user yang berstatus online menjadi offline di database. */
export async function resetOnlineStatus(): Promise<void> {
  await db.update(users).set({ isOnline: false }).where(eq(users.isOnline, true));
}
