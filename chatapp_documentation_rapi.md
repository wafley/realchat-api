# Bab 1 — Daftar Fitur Aplikasi

Fitur-fitur berikut sudah dikunci sebelum perancangan dimulai dan menjadi acuan semua diagram serta skema di dokumen ini.

## 1.1 Fitur Wajib

| No | Kategori | Fitur |
|----|----------|-------|
| 1 | Autentikasi | Register, Login, Logout, JWT Access + Refresh Token, Lupa/Reset Password |
| 2 | Profil | Edit profil (nama, bio), Upload foto profil, Status online/offline, Last seen, Lihat profil user lain |
| 3 | Chat Pribadi | Chat 1-lawan-1, Riwayat + pagination, Kirim/Edit/Hapus pesan (real-time), Reply, Reaksi emoji, Unread counter, Hapus percakapan |
| 4 | Chat Grup | Chat grup real-time, Riwayat + pagination |
| 5 | Manajemen Grup | Buat grup, Tambah/keluarkan member (direct add), Ubah nama & foto grup, Keluar grup, Promote/demote admin, Info grup |
| 6 | Real-Time | Kirim/edit/hapus pesan real-time, Typing indicator, Status online, Delivered & Seen, Seen grup (semua anggota), Reconnection handling |
| 7 | System Message | Otomatis di timeline: 'X bergabung', 'X dikeluarkan', 'X jadi admin', 'X keluar grup' |
| 8 | Notifikasi | Pesan baru & ditambahkan ke grup — tersimpan di DB, push real-time |
| 9 | Pencarian | Cari user, grup, isi chat |
| 10 | Keamanan | Block/unblock user, Rate limiting, Validasi input backend (Zod), Audit log |
| 11 | Tampilan | Responsive (mobile & desktop) |

## 1.2 Fitur Nilai Tambah

| No | Fitur | Keterangan |
|----|-------|------------|
| 1 | Verifikasi Email | Konfirmasi email sebelum akun aktif |
| 2 | Mute Chat/Grup | Bisukan notifikasi conversation/grup tertentu |
| 3 | Dark Mode | Toggle tema gelap/terang |
| 4 | Forward Pesan | Teruskan pesan ke chat/grup lain |
| 5 | Pin Pesan | Sematkan pesan penting di atas chat |
| 6 | Delete for Me | Hapus pesan hanya di sisi sendiri |

## 1.3 Di Luar Scope

- Voice Call, Video Call, Screen Sharing
- File/Attachment Sharing (gambar, PDF, dsb)
- Voice Message, Stiker/GIF custom
- Server & Channel ala Discord
- Invite-accept flow untuk grup (pakai direct add)

> **Catatan:** Audit Log (bagian 1.1 Keamanan) sengaja tidak tampil sebagai Use Case tersendiri karena bersifat proses internal sistem, bukan interaksi yang diinisiasi aktor — dicatat otomatis oleh backend setiap kali aksi penting terjadi (login, hapus pesan, kick member, dsb), bukan aksi yang dipicu langsung oleh user. Tetap didokumentasikan di ERD dan Schema (Bab 6-7) karena berupa tabel di database.

---

# Bab 2 — Teknologi yang Digunakan

| Bagian | Teknologi | Fungsi |
|--------|-----------|--------|
| Frontend | React (Vite) | Library UI utama |
| Frontend | Tailwind CSS | Utility-first styling, responsive |
| Frontend | Axios | HTTP client, interceptor auto-refresh token |
| Frontend | Socket.IO Client | Koneksi real-time ke backend |
| Backend | Express.js | REST API framework (Node.js) |
| Backend | Socket.IO Server | WebSocket server untuk fitur real-time |
| Backend | Drizzle ORM | Query builder + schema migration PostgreSQL |
| Backend | Zod | Validasi input request di sisi server |
| Backend | bcrypt | Hashing password |
| Backend | jsonwebtoken | Generate & verifikasi JWT |
| Backend | express-rate-limit | Rate limiting endpoint login & pesan |
| Backend | Multer | Upload file (avatar & foto grup) |
| Backend | Helmet | Security headers otomatis |
| Database | PostgreSQL | Relational database utama |
| Auth | JWT | Access token (15 menit) + Refresh token (7 hari, httpOnly cookie) |
| Version Control | Git + GitHub | Source control + kolaborasi tim |
| Deployment | Railway / Render | Backend (support WebSocket persisten) |
| Deployment | Vercel | Frontend |

---

# Bab 3 — Arsitektur Sistem

## 3.1 Layer Aplikasi

| Layer | Komponen | Keterangan |
|-------|----------|------------|
| Client | React + Socket.IO Client | Antarmuka pengguna, kirim request HTTP dan event socket |
| REST Server | Express.js | Autentikasi, profil, riwayat chat, search, manajemen grup (setup) |
| Realtime Server | Socket.IO | Pesan, typing, presence, notifikasi, perubahan grup — real-time |
| Database | PostgreSQL + Drizzle | Penyimpanan permanen semua data |

## 3.2 Pembagian REST vs Socket.IO

| Jalur | Digunakan Untuk | Alasan |
|-------|-----------------|--------|
| REST (HTTP) | Register, login, logout, refresh token, profil, riwayat chat, buat conversation & grup, notifikasi history, search, block/mute | Data statis / setup awal / tidak butuh broadcast ke user lain |
| Socket.IO | Kirim/edit/hapus pesan, typing, presence online/offline, delivered & seen, aksi grup real-time, push notifikasi | Harus langsung terlihat oleh user lain tanpa delay |

---

# Bab 4 — Use Case Diagram

## 4.1 Aktor

| Aktor | Deskripsi |
|-------|-----------|
| Guest | Pengguna yang belum login. Hanya dapat melakukan Register, Login, Forgot Password, dan Reset Password. |
| Member | Pengguna yang sudah login dan memiliki akses ke seluruh fitur aplikasi. |
| Group Admin | Member yang memiliki hak tambahan untuk mengelola grup tertentu. |

## 4.2 Daftar Use Case

| Kode | Use Case | Aktor | Keterangan |
|------|----------|-------|------------|
| UC-01 | Register | Guest | Buat akun baru |
| UC-02 | Login | Guest | Masuk dengan email & password |
| UC-03 | Logout | Member | Akhiri sesi |
| UC-04 | Refresh Token | Member | Mendapatkan access token baru menggunakan refresh token |
| UC-05 | Forgot Password | Guest | Meminta token reset password via email |
| UC-06 | Reset Password | Guest | Mengatur password baru menggunakan token reset |
| UC-07 | Edit Profil | Member | Ubah nama, bio |
| UC-08 | Upload Avatar | Member | Ganti foto profil |
| UC-09 | Lihat Profil User | Member | Lihat nama, foto, bio, last seen user lain |
| UC-10 | Kirim Pesan | Member | Kirim pesan real-time ke chat pribadi/grup |
| UC-11 | Edit / Hapus Pesan | Member | Edit atau hapus pesan milik sendiri (real-time) |
| UC-12 | Reply / Reaksi | Member | Balas atau beri reaksi emoji ke pesan |
| UC-13 | Hapus Riwayat Chat | Member | Clear chat dari daftar conversation |
| UC-14 | Riwayat Chat | Member | Muat pesan sebelumnya (infinite scroll) |
| UC-15 | Cari | Member | Cari user, grup, atau isi pesan |
| UC-16 | Lihat Notifikasi | Member | Lihat & tandai baca notifikasi |
| UC-17 | Block User | Member | Blokir user agar tidak bisa kirim pesan |
| UC-18 | Buat Grup | Member | Buat grup baru, creator otomatis menjadi Group Admin |
| UC-19 | Ubah Info Grup | Group Admin | Ganti nama, foto profil, dan deskripsi grup |
| UC-20 | Keluar Grup | Member, Group Admin | Keluar (auto-transfer admin jika perlu) |
| UC-21 | Tambah Member | Group Admin | Tambah anggota baru (direct add) |
| UC-22 | Keluarkan Member | Group Admin | Keluarkan anggota dari grup |
| UC-23 | Ubah Role Admin | Group Admin | Promote/demote member jadi admin |
| UC-24 | Lihat Info Grup | Member, Group Admin | Detail grup, daftar member & role |

---

# Bab 5 — Flowchart Alur Aplikasi

Menggambarkan alur pemakaian aplikasi dari pertama dibuka hingga user aktif melakukan chat, lengkap dengan titik keputusan (decision point) pada tiap proses.

## 5.1 Alur Register, Login & Logout

| Langkah | Pelaku | Kondisi / Keputusan | Hasil |
|---------|--------|---------------------|-------|
| Buka aplikasi | User | Token ada & valid? | Ya → halaman utama chat; Tidak → halaman Login |
| Token expired | Sistem | — | Kirim refresh token → access token baru → halaman utama |
| Isi form Register | User | — | username, email, password |
| Validasi input | Sistem | Input valid & belum terdaftar? | Tidak → tampilkan error, kembali ke form |
| Hash & simpan akun | Sistem | — | Password di-hash (bcrypt), redirect ke Login |
| Isi form Login | User | — | email, password |
| Verifikasi kredensial | Sistem | Kredensial valid? | Tidak → error 401, tetap di Login |
| Buat sesi | Sistem | — | Generate access + refresh token, set online, koneksi socket |
| Masuk ke aplikasi | Sistem | — | Daftar chat + unread counter + notifikasi real-time aktif |
| Tekan Logout | User | — | Client kirim POST /auth/logout |
| Hapus sesi | Server | — | Hapus refresh token dari DB & cookie |
| Disconnect socket | Client | — | Socket.IO disconnect, server update is_online = false, last_seen_at = now() |
| Broadcast status | Server | — | Broadcast presence:update ke kontak → status offline langsung terlihat |

## 5.2 Alur Chat Pribadi & Kirim Pesan Real-Time

| Langkah | Pelaku | Kondisi / Keputusan | Hasil |
|---------|--------|---------------------|-------|
| Cari user | User | — | Ketik username → pilih dari hasil pencarian |
| Cek conversation | Sistem | Conversation sudah ada? | Ya → buka yang lama; Tidak → POST /conversations (buat baru) |
| Buka layar chat | Client | — | Emit room:join ke Socket.IO server |
| Ketik pesan | User | — | Emit typing:start → lawan chat lihat indikator mengetik |
| Tekan kirim | Client | — | Emit message:send { conversationId, content, replyToId? } |
| Validasi keanggotaan | Server | User adalah anggota conversation? | Tidak → emit error forbidden; Ya → lanjut simpan |
| Simpan & broadcast | Server | — | INSERT ke tabel messages → broadcast message:new ke room |
| Terima pesan | Client B | Penerima online? | Ya → pesan muncul real-time, emit delivered (centang 2); Tidak → server simpan notifikasi |
| Baca pesan | Client B | — | Buka chat → emit message:seen → centang 2 biru untuk pengirim |
| Hapus percakapan | User | — | Tekan 'Hapus Percakapan' → PATCH /conversations/:id/clear → set cleared_at = now() (hanya untuk user ini) |

## 5.3 Alur Buat Grup

| Langkah | Pelaku | Kondisi / Keputusan | Hasil |
|---------|--------|---------------------|-------|
| Isi form buat grup | User | — | Nama grup, pilih member awal, unggah foto (opsional) |
| Validasi | Sistem | Nama tidak kosong & minimal 1 member? | Tidak → tampilkan error |
| Buat conversation | Server | — | POST /groups → INSERT conversation (type=GROUP) |
| Set admin & member | Server | — | Creator jadi ADMIN, member awal jadi MEMBER di conversation_members |
| System message | Server | — | INSERT 'Grup dibuat oleh [nama]' ke tabel messages |
| Broadcast | Server | — | Broadcast group:updated → semua anggota join room socket grup |

## 5.4 Alur Kelola Member Grup (Admin)

| Langkah | Pelaku | Kondisi / Keputusan | Hasil |
|---------|--------|---------------------|-------|
| Pilih aksi | Group Admin | — | Tambah member atau keluarkan member |
| Emit event | Client | — | group:member:add atau group:member:remove |
| Validasi role | Server | User adalah admin grup? | Tidak → emit error NOT_GROUP_ADMIN (forbidden) |
| Eksekusi perubahan | Server | — | Update tabel conversation_members |
| System message | Server | — | INSERT system message ke tabel messages |
| Broadcast | Server | — | Broadcast group:updated ke room → semua anggota lihat perubahan real-time |
| Jika kick | Server | — | Paksa socket member leave room, tidak lagi terima pesan grup |

## 5.5 Alur Lupa & Reset Password

| Langkah | Pelaku | Kondisi / Keputusan | Hasil |
|---------|--------|---------------------|-------|
| Tekan "Lupa Password" | User | — | Form input email |
| Isi email | User | — | Masukkan email terdaftar |
| Cari email | Sistem | Email terdaftar? | Tidak → tampilkan error "Email tidak ditemukan"; Ya → lanjut |
| Generate reset token | Server | — | Buat token unik + expiry time, simpan ke users.reset_token & users.reset_token_expires_at |
| Kirim email (simulasi) | Server | — | Kembalikan token di response API (simulasi, tidak kirim email beneran) |
| Buka link reset | User | — | Form input password baru + konfirmasi |
| Kirim token + password baru | User | — | POST /auth/reset-password { token, password } |
| Validasi token | Server | Token valid & belum expired? | Tidak → error 400 "Token tidak valid/kedaluwarsa"; Ya → lanjut |
| Hash & simpan password baru | Server | — | Update password_hash, hapus reset_token & reset_token_expires_at |
| Redirect ke Login | Sistem | — | User login dengan password baru |

---

# Bab 6 — Entity Relationship Diagram (ERD)

ERD menggambarkan struktur data dan relasi antar entitas sistem. Dirancang berdasarkan seluruh fitur wajib yang telah dikunci.

## 6.1 Daftar Entitas

| Entitas | Fungsi |
|---------|--------|
| users | Data akun dan profil semua pengguna |
| refresh_tokens | Refresh token per device (multi device, revocable) |
| conversations | Percakapan (type: PRIVATE atau GROUP) |
| conversation_members | Pivot user ↔ conversation: role (ADMIN/MEMBER), muted_until, cleared_at |
| messages | Semua pesan (TEXT/SYSTEM), mendukung reply (self-join) dan soft-delete |
| message_reactions | Reaksi emoji per pesan per user |
| message_status | Status pesan (SENT/DELIVERED/SEEN) per penerima |
| notifications | Notifikasi persisten: pesan baru, undangan grup, mention, reply |
| blocked_users | Relasi blokir antar user |
| audit_logs | Catatan aktivitas penting backend (login, delete, kick, dsb) |

## 6.2 Relasi Antar Entitas

| Entitas A | Kardinalitas | Entitas B | Keterangan |
|-----------|-------------|-----------|------------|
| users | 1 : N | refresh_tokens | Satu user bisa punya banyak token (multi device) |
| users | M : N | conversations | Lewat tabel conversation_members |
| conversations | 1 : N | messages | Satu conversation berisi banyak pesan |
| users | 1 : N | messages | Satu user bisa kirim banyak pesan |
| messages | Self 1:N | messages | reply_to_id: pesan bisa balas pesan lain |
| messages | 1 : N | message_reactions | Satu pesan bisa punya banyak reaksi emoji |
| messages | 1 : N | message_status | Status dilacak per penerima per pesan |
| users | 1 : N | notifications | Satu user punya banyak notifikasi |
| users | 1 : N | blocked_users | Satu user bisa blokir banyak user lain |
| users | 1 : N | audit_logs | Aktivitas tiap user dicatat di audit log |

---

# Bab 7 — Desain Database (Schema Tabel)

Turunan dari ERD. Mendefinisikan kolom, tipe data, constraint, dan index tiap tabel.

## Tabel: users

| Kolom | Tipe Data | Constraint | Keterangan |
|-------|-----------|------------|------------|
| id | UUID | PK, DEFAULT gen_random_uuid() | Primary key |
| username | VARCHAR(50) | NOT NULL, UNIQUE | Nama pengguna unik |
| email | VARCHAR(255) | NOT NULL, UNIQUE | Email unik |
| password_hash | TEXT | NOT NULL | Hash bcrypt |
| bio | TEXT | NULLABLE | Bio singkat |
| avatar_url | TEXT | NULLABLE | URL foto profil |
| status_text | VARCHAR(100) | DEFAULT 'Hey there!' | Status teks kustom |
| is_online | BOOLEAN | NOT NULL, DEFAULT false | Status online |
| last_seen_at | TIMESTAMP | NULLABLE | Waktu terakhir online |
| is_verified | BOOLEAN | NOT NULL, DEFAULT false | Status verifikasi email |
| reset_token | TEXT | NULLABLE | Token untuk reset password |
| reset_token_expires_at | TIMESTAMP | NULLABLE | Waktu kedaluwarsa token reset |
| created_at | TIMESTAMP | NOT NULL, DEFAULT now() | Waktu daftar |
| updated_at | TIMESTAMP | NOT NULL, DEFAULT now() | Waktu update terakhir |

## Tabel: refresh_tokens

| Kolom | Tipe Data | Constraint | Keterangan |
|-------|-----------|------------|------------|
| id | UUID | PK | Primary key |
| user_id | UUID | FK → users.id, ON DELETE CASCADE | Pemilik token |
| token | TEXT | NOT NULL, UNIQUE | Nilai refresh token |
| expired_at | TIMESTAMP | NOT NULL | Waktu kedaluwarsa |
| created_at | TIMESTAMP | NOT NULL, DEFAULT now() | Waktu dibuat |

## Tabel: conversations

| Kolom | Tipe Data | Constraint | Keterangan |
|-------|-----------|------------|------------|
| id | UUID | PK | Primary key |
| type | ENUM('PRIVATE','GROUP') | NOT NULL | Tipe percakapan |
| name | VARCHAR(100) | NULLABLE | Nama grup (null untuk PRIVATE) |
| avatar_url | TEXT | NULLABLE | Foto grup |
| description | TEXT | NULLABLE | Deskripsi grup |
| created_by | UUID | FK → users.id | Pembuat conversation |
| created_at | TIMESTAMP | NOT NULL, DEFAULT now() | Waktu dibuat |

## Tabel: conversation_members

| Kolom | Tipe Data | Constraint | Keterangan |
|-------|-----------|------------|------------|
| id | UUID | PK | Primary key |
| conversation_id | UUID | FK → conversations.id, CASCADE | Referensi conversation |
| user_id | UUID | FK → users.id, CASCADE | Referensi user |
| role | ENUM('ADMIN','MEMBER') | NOT NULL, DEFAULT 'MEMBER' | Role di grup |
| joined_at | TIMESTAMP | NOT NULL, DEFAULT now() | Waktu bergabung |
| muted_until | TIMESTAMP | NULLABLE | Waktu mute berakhir |
| cleared_at | TIMESTAMP | NULLABLE | Waktu clear chat |

> **Index:** (conversation_id), (user_id) | UNIQUE(conversation_id, user_id)

## Tabel: messages

| Kolom | Tipe Data | Constraint | Keterangan |
|-------|-----------|------------|------------|
| id | UUID | PK | Primary key |
| conversation_id | UUID | FK → conversations.id, CASCADE | Referensi conversation |
| sender_id | UUID | FK → users.id | Pengirim |
| type | ENUM('TEXT','SYSTEM') | NOT NULL, DEFAULT 'TEXT' | Tipe pesan |
| content | TEXT | NOT NULL | Isi pesan |
| reply_to_id | UUID | FK → messages.id, NULLABLE | Pesan yang dibalas |
| is_pinned | BOOLEAN | NOT NULL, DEFAULT false | Disematkan |
| is_edited | BOOLEAN | NOT NULL, DEFAULT false | Sudah diedit |
| is_deleted | BOOLEAN | NOT NULL, DEFAULT false | Soft-delete |
| edited_at | TIMESTAMP | NULLABLE | Waktu edit |
| created_at | TIMESTAMP | NOT NULL, DEFAULT now() | Waktu kirim |
| updated_at | TIMESTAMP | NOT NULL, DEFAULT now() | Waktu update |

> **Index:** (conversation_id, created_at DESC) — query riwayat chat dengan pagination

## Tabel: message_reactions

| Kolom | Tipe Data | Constraint | Keterangan |
|-------|-----------|------------|------------|
| id | UUID | PK | Primary key |
| message_id | UUID | FK → messages.id, CASCADE | Pesan yang direaksi |
| user_id | UUID | FK → users.id, CASCADE | User yang bereaksi |
| emoji | VARCHAR(10) | NOT NULL | Karakter emoji |
| created_at | TIMESTAMP | NOT NULL, DEFAULT now() | Waktu reaksi |

> **Unique:** UNIQUE(message_id, user_id, emoji)

## Tabel: message_status

| Kolom | Tipe Data | Constraint | Keterangan |
|-------|-----------|------------|------------|
| id | UUID | PK | Primary key |
| message_id | UUID | FK → messages.id, CASCADE | Pesan |
| user_id | UUID | FK → users.id, CASCADE | Penerima |
| status | ENUM('SENT','DELIVERED','SEEN') | NOT NULL, DEFAULT 'SENT' | Status |
| updated_at | TIMESTAMP | NOT NULL, DEFAULT now() | Waktu update |

> **Unique:** UNIQUE(message_id, user_id)

## Tabel: notifications

| Kolom | Tipe Data | Constraint | Keterangan |
|-------|-----------|------------|------------|
| id | UUID | PK | Primary key |
| user_id | UUID | FK → users.id, CASCADE | Penerima notifikasi |
| type | VARCHAR(50) | NOT NULL | 'message','group_invite','mention','reply' |
| actor_id | UUID | FK → users.id, NULLABLE | User pemicu notifikasi |
| conversation_id | UUID | FK → conversations.id, NULLABLE | Untuk navigasi langsung |
| message_id | UUID | FK → messages.id, NULLABLE | Pesan terkait |
| title | VARCHAR(100) | NOT NULL | Judul: 'Pesan Baru' |
| body | TEXT | NOT NULL | Isi: 'Andi mengirim pesan' |
| is_read | BOOLEAN | NOT NULL, DEFAULT false | Status baca |
| created_at | TIMESTAMP | NOT NULL, DEFAULT now() | Waktu notifikasi |

> **Index:** (user_id, is_read, created_at DESC)

## Tabel: blocked_users

| Kolom | Tipe Data | Constraint | Keterangan |
|-------|-----------|------------|------------|
| id | UUID | PK | Primary key |
| blocker_id | UUID | FK → users.id, CASCADE | User yang memblokir |
| blocked_id | UUID | FK → users.id, CASCADE | User yang diblokir |
| created_at | TIMESTAMP | NOT NULL, DEFAULT now() | Waktu blokir |

> **Unique:** UNIQUE(blocker_id, blocked_id)

## Tabel: audit_logs

| Kolom | Tipe Data | Constraint | Keterangan |
|-------|-----------|------------|------------|
| id | UUID | PK | Primary key |
| actor_id | UUID | FK → users.id, NULLABLE | User yang beraksi |
| action | VARCHAR(100) | NOT NULL | 'user.login','message.delete','group.kick_member' |
| target_id | UUID | NULLABLE | ID target aksi |
| ip_address | VARCHAR(45) | NULLABLE | IP address (IPv4/IPv6) |
| user_agent | TEXT | NULLABLE | Info browser/device |
| created_at | TIMESTAMP | NOT NULL, DEFAULT now() | Waktu aksi |

---

## 7.1 Ringkasan Index

| Tabel | Kolom Index | Alasan |
|-------|-------------|--------|
| messages | (conversation_id, created_at DESC) | Query riwayat chat — paling sering dipanggil |
| conversation_members | (conversation_id) | Ambil semua anggota conversation |
| conversation_members | (user_id) | Ambil semua conversation milik satu user |
| notifications | (user_id, is_read, created_at DESC) | Query notifikasi belum dibaca per user |
| refresh_tokens | (user_id) | Cari & hapus token saat logout |
| blocked_users | (blocker_id, blocked_id) | Cek status blokir antar dua user |
