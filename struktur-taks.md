# Struktur Folder Backend (Express.js)

Pola modular (feature-based): tiap fitur punya folder sendiri berisi controller, service, route, validator, dan repository.

```
realchat-api/
├── scripts/
│   └── seed.js                          ← Data dummy untuk demo
├── src/
│   ├── config/
│   │   ├── env.js                       ← Membaca & export seluruh environment variable
│   │   └── constants.js                 ← Konstanta aplikasi (JWT expiry, max member, dll.)
│   ├── db/
│   │   ├── index.js                     ← Koneksi Drizzle ORM ke PostgreSQL
│   │   ├── schema/
│   │   │   ├── index.js                 ← Export seluruh schema
│   │   │   ├── users.js
│   │   │   ├── refreshTokens.js
│   │   │   ├── conversations.js
│   │   │   ├── conversationMembers.js
│   │   │   ├── messages.js
│   │   │   ├── messageReactions.js
│   │   │   ├── messageStatus.js
│   │   │   ├── notifications.js
│   │   │   └── blockedUsers.js
│   │   └── migrations/
│   ├── middlewares/
│   │   ├── verifyJWT.js                 ← Verifikasi Access Token JWT
│   │   ├── validate.js                  ← Validasi request menggunakan Zod
│   │   ├── upload.js                    ← Upload avatar user & grup (Multer)
│   │   ├── rateLimiter.js               ← Membatasi request untuk mencegah spam/brute force
│   │   └── errorHandler.js              ← Menangani seluruh error aplikasi
│   ├── modules/
│   │   ├── auth/
│   │   │   ├── auth.route.js
│   │   │   ├── auth.controller.js
│   │   │   ├── auth.service.js
│   │   │   ├── auth.repository.js
│   │   │   └── auth.validator.js
│   │   ├── users/
│   │   │   ├── users.route.js
│   │   │   ├── users.controller.js
│   │   │   ├── users.service.js
│   │   │   ├── users.repository.js
│   │   │   └── users.validator.js
│   │   ├── conversations/
│   │   │   ├── conversations.route.js
│   │   │   ├── conversations.controller.js
│   │   │   ├── conversations.service.js
│   │   │   ├── conversations.repository.js
│   │   │   └── conversations.validator.js
│   │   ├── groups/
│   │   │   ├── groups.route.js
│   │   │   ├── groups.controller.js
│   │   │   ├── groups.service.js
│   │   │   ├── groups.repository.js
│   │   │   └── groups.validator.js
│   │   ├── notifications/
│   │   │   ├── notifications.route.js
│   │   │   ├── notifications.controller.js
│   │   │   ├── notifications.service.js
│   │   │   ├── notifications.repository.js
│   │   │   └── notifications.validator.js
│   │   └── search/
│   │       ├── search.route.js
│   │       ├── search.controller.js
│   │       ├── search.service.js
│   │       └── search.repository.js
│   ├── routes/
│   │   └── index.js                    ← Menggabungkan seluruh route
│   ├── socket/
│   │   ├── index.js                    ← Inisialisasi Socket.IO & autentikasi socket
│   │   └── handlers/
│   │       ├── message.handler.js
│   │       ├── typing.handler.js
│   │       ├── presence.handler.js
│   │       └── group.handler.js
│   ├── utils/
│   │   ├── generateToken.js            ← Membuat Access Token & Refresh Token
│   │   ├── hashPassword.js             ← Hash & verifikasi password
│   │   └── formatResponse.js           ← Format response API standar
│   ├── app.js                          ← Konfigurasi Express (middleware, routes)
│   └── server.js                       ← Menjalankan HTTP Server & Socket.IO
├── uploads/
│   ├── avatars/
│   └── groups/
├── .env
├── .env.example
├── .gitignore
├── drizzle.config.js
├── package.json
└── README.md
```

---

# Roadmap Pengerjaan Backend (Express.js + Drizzle ORM + PostgreSQL)

> **Tujuan:** Mengembangkan backend aplikasi chat secara bertahap menggunakan workflow Git yang mendekati standar industri.

---

## Git Workflow

```
main
│
└── develop
     │
     ├── feature/setup
     ├── feature/auth
     ├── feature/users
     ├── feature/conversations
     ├── feature/groups
     ├── feature/socket
     ├── feature/search
     └── feature/deployment
```

**main** → Branch production (stabil, siap deploy)
**develop** → Branch integrasi seluruh fitur

Semua `feature/*` dibuat dari `develop`, lalu setelah selesai di-merge kembali ke `develop`. Setelah semua fitur selesai dan stabil, `develop` di-merge ke `main`.

---

## Sprint 1 — Project Setup & Konfigurasi

**Branch:** `feature/setup`

**Jangan hanya satu commit. Pecah menjadi beberapa commit kecil.**

| Task |
|------|
| Inisialisasi project (npm init) |
| Install dependency |
| Buat struktur folder |
| Setup dotenv |
| Setup .gitignore, .env.example |
| Setup Express.js (app.js, server.js) |
| Setup koneksi PostgreSQL |
| Setup Drizzle ORM |
| Setup routes/index.js |
| Setup error handler global |
| Setup format response utility |

### Contoh Commit

```
chore(setup): initialize express project
chore(setup): configure project structure
chore(setup): add environment variables
chore(db): configure postgresql connection
chore(db): add drizzle orm configuration
feat(middleware): add global error handler
feat(utils): add standardized response formatter
docs: update readme installation guide
```

**Output:** Server berjalan, database terkoneksi.

---

## Sprint 2 — Database Schema

**Branch:** Tetap di `feature/setup` (masih bagian setup)

| Task |
|------|
| Buat schema users |
| Buat schema refresh_tokens |
| Buat schema conversations |
| Buat schema conversation_members |
| Buat schema messages |
| Buat schema message_reactions |
| Buat schema message_status |
| Buat schema notifications |
| Buat schema blocked_users |
| Buat schema/index.js (export all) |
| Generate migration |
| Jalankan migration |

### Contoh Commit

```
feat(db): create users schema
feat(db): create refresh_tokens schema
feat(db): create conversations schema
feat(db): create conversation_members schema
feat(db): create messages schema
feat(db): create message_reactions schema
feat(db): create message_status schema
feat(db): create notifications schema
feat(db): create blocked_users schema
feat(db): add initial database migration
```

**Output:** Seluruh tabel berhasil dibuat di database.

---

## Sprint 3 — Middleware

**Branch:** `feature/setup`

| Task |
|------|
| verifyJWT (verifikasi access token) |
| validate (Zod validation middleware) |
| upload (Multer config untuk avatar & foto grup) |
| rateLimiter (express-rate-limit) |
| helmet (security headers) |

### Contoh Commit

```
feat(middleware): add jwt verification middleware
feat(middleware): add zod validation middleware
feat(middleware): add multer upload middleware
feat(middleware): add rate limiter middleware
feat(middleware): add helmet security headers
```

**Output:** Middleware global selesai.

> Setelah ini, merge `feature/setup` ke `develop` melalui Pull Request.

---

## Sprint 4 — Authentication

**Branch:** `feature/auth`

| Task |
|------|
| Register (validator → repository → service → controller → route) |
| Login + JWT |
| Refresh Token |
| Logout |
| Forgot Password |
| Reset Password |
| Verify Email |

### Contoh Commit

```
feat(auth): create auth module structure
feat(auth): implement user registration
feat(auth): hash password using bcrypt
feat(auth): implement login endpoint
feat(auth): generate jwt access token
feat(auth): implement refresh token
feat(auth): implement logout
feat(auth): implement forgot password
feat(auth): implement reset password
feat(auth): implement email verification
fix(auth): validate duplicate email on registration
```

### Testing

- Seluruh endpoint diuji menggunakan Postman

### Output

- Modul Authentication selesai

---

## Sprint 5 — Users

**Branch:** `feature/users`

| Task |
|------|
| GET /users/me |
| PATCH /users/me |
| Upload Avatar |
| GET /users/:id |
| Block User |
| Unblock User |

### Contoh Commit

```
feat(users): create user module
feat(users): get current user profile
feat(users): update user profile
feat(users): upload user avatar
feat(users): implement block user
feat(users): implement unblock user
fix(users): validate avatar file type and size
```

**Output:** Modul User selesai.

---

## Sprint 6 — Conversations

**Branch:** `feature/conversations`

| Task |
|------|
| Create Conversation |
| List Conversation |
| Message History |
| Pagination (cursor-based) |
| Clear Chat |

### Contoh Commit

```
feat(conversations): create conversation module
feat(conversations): create new conversation
feat(conversations): list user conversations
feat(messages): load message history
feat(messages): add cursor-based pagination
feat(conversations): implement clear chat
fix(messages): optimize pagination query
```

**Output:** Modul Conversation selesai.

---

## Sprint 7 — Groups

**Branch:** `feature/groups`

| Task |
|------|
| Create Group |
| Update Group Info |
| Upload Group Avatar |
| Add Member |
| Remove Member |
| Change Member Role |
| Leave Group |

### Contoh Commit

```
feat(groups): create group module
feat(groups): create new group
feat(groups): update group information
feat(groups): upload group avatar
feat(groups): add group members
feat(groups): remove group members
feat(groups): change member role
feat(groups): leave group
fix(groups): validate admin permission on actions
```

**Output:** Modul Group selesai.

---

## Sprint 8 — Socket.IO

**Branch:** `feature/socket`

Ini branch terbesar.

| Task |
|------|
| Setup Socket.IO server |
| Authentication handshake (JWT) |
| room:join |
| room:leave |
| message:send |
| message:edit |
| message:delete |
| message:status (delivered & seen) |
| typing:start |
| typing:stop |
| Online / Offline / Last Seen |
| Group realtime events |
| Push notification realtime |

### Contoh Commit

```
feat(socket): initialize socket.io server
feat(socket): authenticate socket connection
feat(socket): implement room join
feat(socket): implement room leave
feat(socket): send realtime message
feat(socket): edit realtime message
feat(socket): delete realtime message
feat(socket): implement delivered status
feat(socket): implement seen status
feat(socket): implement typing indicator
feat(socket): implement online presence
feat(socket): implement group realtime events
feat(socket): push realtime notifications
fix(socket): improve room authorization
```

**Output:** Real-time chat selesai.

---

## Sprint 9 — Search & Notifications

**Branch:** `feature/search`

| Task Search |
|------|
| Search Users |
| Search Groups |
| Search Messages |

| Task Notifications |
|------|
| GET /notifications |
| PATCH /notifications/:id/read |
| PATCH /notifications/read-all |
| Push notifikasi realtime (via Socket.IO) |

### Contoh Commit

```
feat(search): create search module
feat(search): search users
feat(search): search groups
feat(search): search messages
fix(search): improve search performance
feat(notification): list notifications
feat(notification): mark notification as read
feat(notification): mark all notifications as read
```

**Output:** Fitur Search & Notifications selesai.

---

## Sprint 10 — Testing & Deployment

**Branch:** `feature/deployment`

| Task |
|------|
| Buat Postman collection semua endpoint |
| Test Authentication |
| Test Users |
| Test Conversations |
| Test Groups |
| Test Socket.IO |
| Test Search |
| Test Notification |
| Deploy Backend (Railway / Render) |
| Konfigurasi environment production |
| Smoke test |
| Dokumentasi deployment di README |

### Contoh Commit

```
docs(postman): create authentication collection
docs(postman): add users endpoints collection
docs(postman): add conversations endpoints
docs(postman): add groups endpoints
docs(postman): add socket events documentation
chore(deploy): prepare production environment
chore(deploy): configure production environment variables
docs(deploy): add deployment guide to readme
```

**Output:** Backend berhasil di-deploy dan siap demo.

---

## Standar Commit

Gunakan **Conventional Commit**.

```
feat(auth): implement user registration
feat(auth): implement login
feat(users): upload avatar
feat(groups): add member management
feat(socket): implement message event

fix(auth): validate duplicate email
fix(socket): prevent duplicate message

refactor(users): simplify profile service

docs(api): update rest api documentation

chore(setup): configure drizzle orm
```

---

## Workflow Harian

1. Checkout ke `develop`
2. Pull perubahan terbaru

```
git checkout develop
git pull origin develop
```

3. Buat branch feature

```
git checkout -b feature/auth
```

4. Kerjakan satu modul
5. Commit secara berkala (ingat: satu commit = satu perubahan logis)
6. Push ke GitHub

```
git push -u origin feature/auth
```

7. Buat Pull Request → `develop`
8. Merge
9. Hapus branch feature
10. Lanjut ke feature berikutnya

---

## Kapan Merge?

Setiap feature branch selesai → push → Pull Request → merge ke `develop` → delete branch → buat branch baru untuk fitur berikutnya.

> Jangan membuat semua branch sekaligus. Buat bertahap sesuai fitur yang akan dikerjakan.

---

## Pull Request

Walaupun kamu bekerja sendiri, tetap biasakan membuat Pull Request.

Contoh:

**Title:** Feature: Authentication Module

**Deskripsi:**

```
## Added

- Register
- Login
- Refresh Token
- Logout
- Forgot Password
- Reset Password
- Verify Email

## Tested

- Register
- Login
- Refresh
```

Ini melatih kebiasaan kerja tim dan membuat riwayat proyek lebih rapi.

---

## Workflow Lengkap

```
main
 │
 └────────────── develop
                    │
                    ├── feature/setup
                    │        ↓
                    │    Pull Request
                    │        ↓
                    │     Merge
                    │
                    ├── feature/auth
                    │        ↓
                    │    Pull Request
                    │        ↓
                    │     Merge
                    │
                    ├── feature/users
                    │
                    ├── feature/conversations
                    │
                    ├── feature/groups
                    │
                    ├── feature/socket
                    │
                    ├── feature/search
                    │
                    └── feature/deployment
```

---

## Target Mingguan

| Minggu | Target |
|--------|--------|
| 1 | GitHub workflow, Setup project, Konfigurasi Express/DB, Schema & migration, Middleware |
| 2 | Authentication (Register, Login, Refresh, Logout, Forgot/Reset Password, Verify Email) |
| 3 | Users module (profile, avatar, block/unblock) |
| 4 | Conversations (CRUD, history, pagination, clear) |
| 5 | Groups (CRUD, member management, role, leave) |
| 6 | Socket.IO (message, typing, presence, group events, notification) |
| 7 | Search + Notifications |
| 8 | Postman testing + Deployment |

---

## Status Progress

### Sprint

- [ ] Sprint 1 — Project Setup & Konfigurasi
- [ ] Sprint 2 — Database Schema
- [ ] Sprint 3 — Middleware
- [ ] Sprint 4 — Authentication
- [ ] Sprint 5 — Users
- [ ] Sprint 6 — Conversations
- [ ] Sprint 7 — Groups
- [ ] Sprint 8 — Socket.IO
- [ ] Sprint 9 — Search & Notifications
- [ ] Sprint 10 — Testing & Deployment

> **Catatan:** Fokus menyelesaikan **satu sprint hingga selesai** sebelum berpindah ke sprint berikutnya. Setiap sprint harus melalui proses implementasi, testing, commit, push, dan merge ke `develop` agar riwayat Git tetap rapi dan mudah dipelihara.
