/**
 * Registry presence in-memory: memetakan userId ke himpunan socket.id milik
 * user tersebut. Menjadi sumber kebenaran status online untuk modul socket
 * lain (presence broadcast, status pesan DELIVERED, dsb).
 */

/** Daftar socket.id yang sedang terhubung untuk tiap userId (multi-device). */
export const onlineUsers = new Map<string, Set<string>>();
