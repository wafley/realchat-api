import db from '../src/db/index';
import { sql } from 'drizzle-orm';

async function reset() {
  console.log('Resetting database...');

  await db.execute(sql`
    DROP TABLE IF EXISTS drizzle.__drizzle_migrations CASCADE;
    DROP TABLE IF EXISTS message_reactions CASCADE;
    DROP TABLE IF EXISTS message_status CASCADE;
    DROP TABLE IF EXISTS messages CASCADE;
    DROP TABLE IF EXISTS notifications CASCADE;
    DROP TABLE IF EXISTS friend_requests CASCADE;
    DROP TABLE IF EXISTS blocked_users CASCADE;
    DROP TABLE IF EXISTS conversation_members CASCADE;
    DROP TABLE IF EXISTS refresh_tokens CASCADE;
    DROP TABLE IF EXISTS conversations CASCADE;
    DROP TABLE IF EXISTS users CASCADE;
  `);

  console.log('All tables dropped. Now run: npm run db:migrate && npm run seed');
  process.exit(0);
}

reset().catch((err) => {
  console.error('Reset failed:', err);
  process.exit(1);
});
