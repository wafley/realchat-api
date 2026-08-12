import { eq } from 'drizzle-orm';
import db from '../db/index';
import { users } from '../db/schema/users';

export async function resetOnlineStatus(): Promise<void> {
  await db.update(users).set({ isOnline: false }).where(eq(users.isOnline, true));
}
