import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { env } from '../config/env';
import * as schema from './schema/index';

const queryClient = postgres(env.databaseUrl, { prepare: true });
const db = drizzle(queryClient, { schema });

export default db;
