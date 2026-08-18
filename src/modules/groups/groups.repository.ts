import db from '../../db/index';
import { conversations } from '../../db/schema/conversations';
import { eq } from 'drizzle-orm';

export async function updateGroup(
  id: string,
  data: { name?: string; description?: string | null },
) {
  const [group] = await db
    .update(conversations)
    .set(data)
    .where(eq(conversations.id, id))
    .returning();
  return group || null;
}

export async function updateGroupAvatar(id: string, avatarUrl: string) {
  const [group] = await db
    .update(conversations)
    .set({ avatarUrl })
    .where(eq(conversations.id, id))
    .returning();
  return group || null;
}
