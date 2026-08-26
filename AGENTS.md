# AGENTS.md

## Project

RealChat API — Node.js + Express + TypeScript, Drizzle ORM + PostgreSQL, Socket.IO untuk realtime, JWT auth, upload file via Multer. Server berjalan via `tsx` (bukan dist) saat development.

## Commands

- `npm run dev` — jalankan server tsx
- `npm run build` — typecheck + build
- `npm run lint` — eslint + prettier
- `npm run db:migrate` — jalankan migrasi drizzle yang belum diterapkan
- `npm run db:generate` — generate migrasi baru dari skema

Catatan: DB development adalah remote (`144.79.202.196`) dengan latency pool ~7s per operasi. Jangan menandai "hang" sebagai bug kode; pakai timeout besar di test.

## Workflow (1 issue → 1 branch → 1 PR)

- Setiap PR mengubah 1 issue; issue diberi label, PR TIDAK berlabel.
- Base branch = `develop`. User merge via "Create a merge commit" (jangan squash).
- Body PR: Summary → Changes (commit + SHA) → Why → Verification → Notes → `Closes #X`.

## WAJIB — Pre-push gate (jalankan sebelum setiap commit/push)

1. **Resource-consumer check.** Untuk SETIAP resource bersama yang disentuh perubahan (file di storage, socket room, kolom DB, endpoint, nilai URL), grep semua pemakainya dan pastikan perubahan tidak memutus konsumen lain. Contoh: `fileUrl` dipakai oleh `forwardMessage` (disalin) — aksi unlink file harus memeriksa referensi lain dulu.
2. **Cross-feature test.** Wajib minimal 1 test yang menggabungkan fitur baru × fitur lama (mis. forward+delete, hide+reopen+delivery live, hide+search). Jangan hanya happy-path fitur baru.
3. **`npm run build` + `npm run lint` bersih** sebelum commit.
4. **Full E2E / test relevan dijalankan** (bukan hanya test fitur baru) sebelum push.
5. **Review diff commit-per-commit**, pastikan tidak ada perubahan debug/log sementara, tidak ada perubahan line-ending yang tidak disengaja (file wajib LF).
6. **Gunakan skill `code-review-and-quality`** sebelum push PR.

## Aturan penulisan

- **Komentar bahasa Indonesia WAJIB di semua kode** (aturan permanen sejak issue #187):
  - Header blok `/** ... */` di atas file (sebelum import pertama): 1–3 kalimat tanggung jawab file.
  - JSDoc untuk setiap exported function/class/interface/const/type.
  - Inline `//` hanya untuk logika non-trivial; maksimal ~100 karakter per baris.
  - Untuk file skema DB: JSDoc satu baris per tabel + inline komentar kolom yang tidak self-explanatory.
- Jangan tambahkan komentar bahasa lain atau komentar tanpa nilai dokumentatif.
- Ikuti gaya kode yang sudah ada (prettier/eslint).
- Jangan tinggalkan file temp/artefak (script debug, log) di repo; bersihkan sebelum push.
