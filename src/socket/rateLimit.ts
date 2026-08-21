/**
 * Rate limiter fixed-window in-memory untuk event Socket.IO. Menyediakan
 * limiter generik per kunci serta limiter pesan gabungan per detik dan per
 * menit; seluruh state disimpan di memori proses tanpa dependensi eksternal.
 */

/** Bucket counter untuk satu kunci dalam satu jendela waktu tetap. */
interface Bucket {
  count: number;
  resetAt: number;
}

/**
 * Membuat limiter fixed-window per kunci.
 * @param options.windowMs - Panjang jendela dalam milidetik.
 * @param options.max - Kuota maksimum request per jendela.
 * @returns `allow(key)` untuk cek kuota dan `prune()` untuk membuang
 *   bucket yang sudah kedaluwarsa.
 */
export function createFixedWindowLimiter(options: { windowMs: number; max: number }) {
  const buckets = new Map<string, Bucket>();

  const prune = () => {
    const now = Date.now();
    for (const [key, bucket] of buckets) {
      if (bucket.resetAt <= now) buckets.delete(key);
    }
  };

  const allow = (key: string): boolean => {
    const now = Date.now();
    const bucket = buckets.get(key);

    if (!bucket || bucket.resetAt <= now) {
      buckets.set(key, { count: 1, resetAt: now + options.windowMs });
      return true;
    }

    if (bucket.count < options.max) {
      bucket.count += 1;
      return true;
    }

    return false;
  };

  return { allow, prune };
}

/**
 * Membuat limiter khusus pesan dengan batas ganda: per detik dan per menit.
 * Bucket kedaluwarsa dibersihkan otomatis oleh interval internal tiap 60 detik.
 * @param options.perSecond - Maksimum pesan per detik per user.
 * @param options.perMinute - Maksimum pesan per menit per user.
 * @returns Fungsi `allow(userId)` yang lolos hanya jika kedua batas terpenuhi.
 */
export function createMessageRateLimiter(options: { perSecond: number; perMinute: number }) {
  const perSecondLimiter = createFixedWindowLimiter({ windowMs: 1000, max: options.perSecond });
  const perMinuteLimiter = createFixedWindowLimiter({ windowMs: 60_000, max: options.perMinute });

  const interval = setInterval(() => {
    perSecondLimiter.prune();
    perMinuteLimiter.prune();
  }, 60_000);
  // unref agar interval prune tidak menahan proses Node tetap hidup.
  interval.unref();

  return {
    allow(userId: string): boolean {
      return perSecondLimiter.allow(userId) && perMinuteLimiter.allow(userId);
    },
  };
}
