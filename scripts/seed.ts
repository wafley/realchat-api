import db from '../src/db/index';
import { users } from '../src/db/schema/users';
import { conversations } from '../src/db/schema/conversations';
import { conversationMembers } from '../src/db/schema/conversationMembers';
import { messages } from '../src/db/schema/messages';
import { messageStatus } from '../src/db/schema/messageStatus';
import { messageReactions } from '../src/db/schema/messageReactions';
import { friendRequests } from '../src/db/schema/friendRequests';
import { notifications } from '../src/db/schema/notifications';
import bcrypt from 'bcrypt';
import { BCRYPT_SALT_ROUNDS } from '../src/config/constants';

async function seed() {
  console.log('Seeding database...');

  const passwordHash = await bcrypt.hash('password123', BCRYPT_SALT_ROUNDS);

  // ── Users ─────────────────────────────────────────────
  const [alice, bob, charlie, dave] = await db
    .insert(users)
    .values([
      { username: 'alice', email: 'alice@example.com', passwordHash, isVerified: true },
      { username: 'bob', email: 'bob@example.com', passwordHash, isVerified: true },
      { username: 'charlie', email: 'charlie@example.com', passwordHash, isVerified: true },
      { username: 'dave', email: 'dave@example.com', passwordHash, isVerified: false },
    ])
    .returning();

  // ── Private conversation: alice + bob ─────────────────
  const [privateConv] = await db
    .insert(conversations)
    .values({ type: 'PRIVATE', createdBy: alice.id })
    .returning();

  await db.insert(conversationMembers).values([
    { conversationId: privateConv.id, userId: alice.id },
    { conversationId: privateConv.id, userId: bob.id },
  ]);

  const [msg1, msg2, msg3] = await db
    .insert(messages)
    .values([
      { conversationId: privateConv.id, senderId: alice.id, content: 'Halo bob!' },
      { conversationId: privateConv.id, senderId: bob.id, content: 'Hai alice, apa kabar?' },
      { conversationId: privateConv.id, senderId: alice.id, content: 'Baik, thanks!' },
    ])
    .returning();

  await db.insert(messageStatus).values([
    { messageId: msg1.id, userId: bob.id, status: 'READ' },
    { messageId: msg2.id, userId: alice.id, status: 'READ' },
    { messageId: msg3.id, userId: bob.id, status: 'DELIVERED' },
  ]);

  await db.insert(messageReactions).values([{ messageId: msg1.id, userId: bob.id, emoji: '👋' }]);

  // ── Group conversation: Squad Dev ─────────────────────
  const [group] = await db
    .insert(conversations)
    .values({ type: 'GROUP', name: 'Squad Developer', createdBy: alice.id })
    .returning();

  await db.insert(conversationMembers).values([
    { conversationId: group.id, userId: alice.id, role: 'ADMIN' },
    { conversationId: group.id, userId: bob.id, role: 'MEMBER' },
    { conversationId: group.id, userId: charlie.id, role: 'MEMBER' },
  ]);

  const [sysMsg] = await db
    .insert(messages)
    .values({
      conversationId: group.id,
      senderId: alice.id,
      type: 'SYSTEM',
      content: 'Grup dibuat oleh alice',
    })
    .returning();

  await db.insert(messageStatus).values([
    { messageId: sysMsg.id, userId: bob.id, status: 'READ' },
    { messageId: sysMsg.id, userId: charlie.id, status: 'READ' },
  ]);

  // ── Friend requests ────────────────────────────────────
  // alice → bob (accepted)
  const [fr1] = await db
    .insert(friendRequests)
    .values({ senderId: alice.id, receiverId: bob.id, status: 'ACCEPTED' })
    .returning();

  // alice → charlie (pending)
  const [fr2] = await db
    .insert(friendRequests)
    .values({ senderId: alice.id, receiverId: charlie.id, status: 'PENDING' })
    .returning();

  // ── Notifications ──────────────────────────────────────
  await db.insert(notifications).values([
    {
      userId: bob.id,
      type: 'friend_request_accepted',
      actorId: alice.id,
      title: 'Friend Request Accepted',
      body: 'alice accepted your friend request.',
      isRead: true,
    },
    {
      userId: charlie.id,
      type: 'friend_request_received',
      actorId: alice.id,
      title: 'Friend Request',
      body: 'alice sent you a friend request.',
      isRead: false,
    },
  ]);

  console.log('Seed complete!');
  console.log('── Users ──');
  console.log(`  alice   (verified)   → id: ${alice.id}`);
  console.log(`  bob     (verified)   → id: ${bob.id}`);
  console.log(`  charlie (verified)   → id: ${charlie.id}`);
  console.log(`  dave    (unverified) → id: ${dave.id}`);
  console.log('  Semua password: password123');
  console.log('── Conversations ──');
  console.log(`  Private chat alice-bob   → id: ${privateConv.id}`);
  console.log(`  Group "Squad Developer"  → id: ${group.id}`);
  console.log('── Friend Requests ──');
  console.log(`  alice → bob     (ACCEPTED) → id: ${fr1.id}`);
  console.log(`  alice → charlie (PENDING)  → id: ${fr2.id}`);

  process.exit(0);
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
