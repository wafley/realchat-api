# Git Commit Roadmap

## Branch 1 — feature/setup

Tujuan:
Mempersiapkan seluruh fondasi project sebelum membuat fitur.

### Commit 1

```bash
chore(setup): initialize Express project
```

- npm init
- Install Express
- Install Nodemon
- Install dotenv
- Install cors
- Install helmet
- Install compression
- Install cookie-parser

---

### Commit 2

```bash
chore(setup): configure project structure
```

Membuat struktur folder

```
src/
modules/
middlewares/
config/
utils/
db/
socket/
uploads/
```

---

### Commit 3

```bash
chore(config): configure environment variables
```

Membuat

- env.js
- constants.js
- .env.example

---

### Commit 4

```bash
chore(db): configure PostgreSQL connection
```

Install

- pg
- drizzle
- drizzle-kit

Membuat

```
db/index.js
drizzle.config.js
```

---

### Commit 5

```bash
feat(db): create database schema
```

Membuat

- users
- refresh_tokens
- conversations
- conversation_members
- messages
- message_status
- message_reactions
- notifications
- blocked_users

---

### Commit 6

```bash
feat(db): generate initial migration
```

Generate migration Drizzle

---

### Commit 7

```bash
feat(db): create seed script
```

Membuat

```
scripts/seed.js
```

---

### Commit 8

```bash
feat(middleware): add global middlewares
```

Membuat

- errorHandler
- validate
- verifyJWT
- upload
- rateLimiter

---

### Commit 9

```bash
docs: update project README
```

Isi

- Cara install
- Cara menjalankan project
- Struktur project

---

Merge → develop

---

# Branch 2 — feature/auth

### Commit 1

```bash
feat(auth): create authentication module
```

Membuat folder

```
modules/auth
```

---

### Commit 2

```bash
feat(auth): implement user registration
```

POST `/auth/register`
- Validasi input (Zod)
- Hash password (bcrypt)
- Insert user ke database

---

### Commit 3

```bash
feat(auth): implement user login
```

POST `/auth/login`
- Verifikasi email & password
- Generate access token (JWT)
- Generate refresh token
- Simpan refresh token ke database

---

### Commit 4

```bash
feat(auth): implement refresh token
```

POST `/auth/refresh`
- Validasi refresh token
- Generate access token baru

---

### Commit 5

```bash
feat(auth): implement logout
```

POST `/auth/logout`
- Hapus refresh token dari database

---

### Commit 6

```bash
feat(auth): implement forgot password flow
```

POST `/auth/forgot-password`
- Generate reset token
- Simpan ke database (users.reset_token & reset_token_expires_at)
- Kembalikan token di response (simulasi)

POST `/auth/reset-password`
- Validasi token
- Hash password baru
- Update password & hapus token

---

### Commit 7

```bash
feat(auth): implement email verification
```

POST `/auth/verify-email`
- Generate verification token
- Verifikasi token & update is_verified

---

### Commit 8

```bash
fix(auth): validate duplicate email and username
```

---

Merge → develop

---

# Branch 3 — feature/users

### Commit 1

```bash
feat(users): create users module
```

---

### Commit 2

```bash
feat(users): implement get current user profile
```

---

### Commit 3

```bash
feat(users): implement update profile
```

---

### Commit 4

```bash
feat(users): implement upload avatar
```

---

### Commit 5

```bash
feat(users): implement block user
```

---

### Commit 6

```bash
feat(users): implement unblock user
```

---

### Commit 7

```bash
fix(users): validate avatar upload
```

---

Merge → develop

---

# Branch 4 — feature/conversations

### Commit 1

```bash
feat(conversations): create conversations module
```

---

### Commit 2

```bash
feat(conversations): create private conversation
```

---

### Commit 3

```bash
feat(conversations): get user conversations
```

---

### Commit 4

```bash
feat(messages): implement message history
```

---

### Commit 5

```bash
feat(messages): implement cursor pagination
```

---

### Commit 6

```bash
feat(conversations): implement clear chat
```

---

### Commit 7

```bash
fix(messages): optimize conversation query
```

---

Merge → develop

---

# Branch 5 — feature/groups

### Commit 1

```bash
feat(groups): create groups module
```

---

### Commit 2

```bash
feat(groups): create group
```

---

### Commit 3

```bash
feat(groups): implement update group
```

---

### Commit 4

```bash
feat(groups): implement upload group avatar
```

---

### Commit 5

```bash
feat(groups): implement add members
```

---

### Commit 6

```bash
feat(groups): implement remove members
```

---

### Commit 7

```bash
feat(groups): implement update member role
```

---

### Commit 8

```bash
feat(groups): implement leave group
```

---

### Commit 9

```bash
fix(groups): validate admin permission
```

---

Merge → develop

---

# Branch 6 — feature/socket

### Commit 1

```bash
feat(socket): initialize Socket.IO server
```

---

### Commit 2

```bash
feat(socket): authenticate socket connection
```

---

### Commit 3

```bash
feat(socket): implement room join
```

---

### Commit 4

```bash
feat(socket): implement room leave
```

---

### Commit 5

```bash
feat(socket): implement realtime messaging
```

---

### Commit 6

```bash
feat(socket): implement edit message event
```

---

### Commit 7

```bash
feat(socket): implement delete message event
```

---

### Commit 8

```bash
feat(socket): implement delivered status
```

---

### Commit 9

```bash
feat(socket): implement seen status
```

---

### Commit 10

```bash
feat(socket): implement typing indicator
```

---

### Commit 11

```bash
feat(socket): implement online presence
```

---

### Commit 12

```bash
feat(socket): implement group realtime events
```

---

### Commit 13

```bash
feat(socket): implement notification events
```

---

### Commit 14

```bash
fix(socket): improve room authorization
```

---

Merge → develop

---

# Branch 7 — feature/notifications

Commit 1

```bash
feat(notification): create notification module
```

Commit 2

```bash
feat(notification): list notifications
```

Commit 3

```bash
feat(notification): mark notification as read
```

Commit 4

```bash
feat(notification): mark all notifications as read
```

Merge → develop

---

# Branch 8 — feature/search

Commit 1

```bash
feat(search): create search module
```

Commit 2

```bash
feat(search): search users
```

Commit 3

```bash
feat(search): search groups
```

Commit 4

```bash
feat(search): search messages
```

Commit 5

```bash
fix(search): improve search performance
```

Merge → develop

---

# Branch 9 — feature/postman

Commit 1

```bash
docs(postman): create authentication collection
```

Commit 2

```bash
docs(postman): add users endpoints
```

Commit 3

```bash
docs(postman): add conversations endpoints
```

Commit 4

```bash
docs(postman): add groups endpoints
```

Commit 5

```bash
docs(postman): add socket documentation
```

Merge → develop

---

# Branch 10 — feature/deployment

Commit 1

```bash
chore(deployment): prepare production configuration
```

Commit 2

```bash
chore(deployment): configure environment variables
```

Commit 3

```bash
docs(deployment): add deployment guide
```

Commit 4

```bash
chore(deployment): production smoke testing
```

Merge → develop

---

# Release

Semua feature selesai

↓

Merge

```
develop
        │
        ▼
main
```

Tag release

```
v1.0.0
```