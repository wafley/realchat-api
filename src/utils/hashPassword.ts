/**
 * Utilitas hashing password berbasis bcrypt.
 * Dipakai saat registrasi/perubahan password (hash) dan saat login
 * (perbandingan plaintext dengan hash tersimpan).
 */

import bcrypt from 'bcrypt';
import { BCRYPT_SALT_ROUNDS } from '../config/constants';

/**
 * Meng-hash password plaintext dengan salt rounds dari konstanta.
 * @param password Password plaintext dari pengguna.
 * @returns Hash bcrypt siap disimpan ke database.
 */
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_SALT_ROUNDS);
}

/**
 * Membandingkan password plaintext dengan hash bcrypt.
 * @param password Password plaintext yang diuji.
 * @param hash Hash bcrypt tersimpan di database.
 * @returns true bila cocok, false bila tidak.
 */
export async function comparePassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}
