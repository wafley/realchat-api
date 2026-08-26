/**
 * Utilitas parsing mention (@username) dari isi pesan teks.
 * Dipakai bersama oleh jalur socket dan jalur REST agar aturan
 * mention konsisten di semua titik pembuatan pesan.
 */

/**
 * Mengumpulkan username unik yang di-mention dalam teks pesan (mis. `@budi`).
 * Mention valid: di awal kata atau dipisah tanda baca, 3-30 karakter
 * alfanumerik/underscore. Penutup bracket, backtick, dan brace tidak ikut
 * termakan oleh regex sehingga `@budi]` tetap terdeteksi.
 */
export function extractMentions(content: string): string[] {
  const tokens = content.match(/(^|[^\w])@([A-Za-z0-9_]{3,30})(?=[\s,.;:!?"'`)\]}]|$)/g);
  if (!tokens) return [];
  const seen = new Set<string>();
  for (const token of tokens) {
    seen.add(token.replace(/^[^\w]?@/, ''));
  }
  return [...seen];
}
