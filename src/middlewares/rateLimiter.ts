/**
 * Konfigurasi rate limiter (express-rate-limit) untuk endpoint sensitif.
 * Kunci limit dibentuk dari prefix + IP + scope (email/token) sehingga
 * penyerang tidak bisa mengunci satu akun hanya dengan ganti IP, dan
 * sebaliknya percobaan ke banyak akun dari satu IP tetap terhitung.
 */

import type { Request } from 'express';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';

/**
 * Membuat instance rate limiter dengan jendela 15 menit.
 * @param max Jumlah request maksimum per jendela waktu.
 * @param keyPrefix Prefix kunci untuk memisahkan bucket antar limiter.
 * @param scopeKey Fungsi untuk menambahkan scope (email/refresh token)
 *                 ke kunci agar limit terpisah per target.
 */
function createRateLimiter(max: number, keyPrefix: string, scopeKey: (req: Request) => string) {
  return rateLimit({
    // Jendela sliding 15 menit untuk semua limiter.
    windowMs: 15 * 60 * 1000,
    max,
    message: {
      success: false,
      message: 'Too many requests, please try again later',
    },
    standardHeaders: true,
    legacyHeaders: false,
    // Format kunci: <prefix>:<ip>:<scope> — IP dinormalisasi ipKeyGenerator
    // agar IPv6 dengan notasi berbeda dihitung sebagai alamat yang sama.
    keyGenerator: (req: Request) => {
      const ip = ipKeyGenerator(req.ip ?? 'unknown');
      return `${keyPrefix}:${ip}:${scopeKey(req)}`;
    },
  });
}

/** Limiter endpoint auth (login/register): 100 req/15 menit per IP+email. */
export const authRateLimiter = createRateLimiter(100, 'auth', (req) => {
  // Email dinormalisasi lowercase agar 'A@x.com' dan 'a@x.com' satu bucket.
  const email = (req.body as { email?: unknown } | undefined)?.email;
  return typeof email === 'string' && email.trim() ? email.trim().toLowerCase() : 'noemail';
});

/** Limiter refresh token: 20 req/15 menit per IP+token (dipotong 16 char akhir). */
export const refreshRateLimiter = createRateLimiter(20, 'refresh', (req) => {
  // Hanya 16 karakter terakhir token yang dipakai sebagai scope agar kunci
  // tidak terlalu panjang namun tetap membedakan antar token.
  const token = (req.body as { refreshToken?: unknown } | undefined)?.refreshToken;
  return typeof token === 'string' && token ? token.slice(-16) : 'notoken';
});
