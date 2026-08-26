/**
 * Koneksi database PostgreSQL via drizzle-orm + postgres-js.
 * Diekspor sebagai singleton dan dipakai semua repository.
 */
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { env } from '../config/env';
import * as schema from './schema/index';

// prepare: true mengaktifkan prepared statement untuk performa query berulang.
const queryClient = postgres(env.databaseUrl, { prepare: true });
const db = drizzle(queryClient, { schema });

export default db;
