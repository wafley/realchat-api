import db from '../src/db/index';
import { users } from '../src/db/schema/users';
import { conversations } from '../src/db/schema/conversations';
import { conversationMembers } from '../src/db/schema/conversationMembers';
import { messages } from '../src/db/schema/messages';
import bcrypt from 'bcrypt';
import { BCRYPT_SALT_ROUNDS } from '../src/config/constants';

async function seed() {
  console.log('Seeding database...');

  const passwordHash = await bcrypt.hash('password123', BCRYPT_SALT_ROUNDS);

  const [user1] = await db
    .insert(users)
    .values([
      { username: 'alice', email: 'alice@example.com', passwordHash, isVerified: true },
      { username: 'bob', email: 'bob@example.com', passwordHash, isVerified: true },
      { username: 'charlie', email: 'charlie@example.com', passwordHash, isVerified: true },
    ])
    .returning();

  const [group] = await db
    .insert(conversations)
    .values({
      type: 'GROUP',
      name: 'Squad Developer',
      createdBy: user1.id,
    })
    .returning();

  await db
    .insert(conversationMembers)
    .values([{ conversationId: group.id, userId: user1.id, role: 'ADMIN' }]);

  await db.insert(messages).values({
    conversationId: group.id,
    senderId: user1.id,
    type: 'SYSTEM',
    content: 'Grup dibuat oleh alice',
  });

  console.log('Seed complete!');
  process.exit(0);
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
