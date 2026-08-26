/**
 * Utilitas pembentuk objek "sender" untuk respons API.
 * Menyeragamkan bentuk data pengirim (username, fullName, avatarUrl)
 * yang dikirim ke klien, dengan null untuk field yang tidak tersedia.
 */

/**
 * Mengubah baris data pengguna menjadi objek sender yang aman dikirim.
 * @param user Data pengguna dari query DB, boleh null/undefined.
 * @returns Objek { username, fullName, avatarUrl } atau null bila
 *          input kosong; field yang hilang dinormalisasi menjadi null.
 */
export function toSender(
  user:
    | { username?: string | null; fullName?: string | null; avatarUrl?: string | null }
    | null
    | undefined,
) {
  if (!user) return null;
  return {
    username: user.username ?? null,
    fullName: user.fullName ?? null,
    avatarUrl: user.avatarUrl ?? null,
  };
}
