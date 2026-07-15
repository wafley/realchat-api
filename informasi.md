# 💬 Real-Time Chat Application Backend

Backend aplikasi chat real-time berbasis **Node.js**, **Express.js**, **Socket.IO**, **Drizzle ORM**, dan **PostgreSQL**.

Proyek ini dibuat sebagai backend untuk aplikasi chat yang mendukung percakapan pribadi (Private Chat) dan grup (Group Chat) dengan komunikasi real-time menggunakan Socket.IO.

---

# 📖 Tentang Project

Aplikasi ini merupakan backend REST API dan Socket.IO Server yang menyediakan berbagai fitur seperti:

- Autentikasi pengguna menggunakan JWT
- Chat pribadi (Private Chat)
- Chat grup (Group Chat)
- Pengiriman pesan secara real-time
- Edit & hapus pesan
- Reply pesan
- Status pesan (Sent, Delivered, Seen)
- Typing Indicator
- Online / Offline Presence
- Upload Avatar
- Upload Foto Grup
- Notifikasi
- Pencarian User, Grup, dan Pesan
- Block User
- Audit Log

Backend dibangun menggunakan arsitektur modular agar mudah dikembangkan, dipelihara, dan mengikuti praktik pengembangan perangkat lunak yang umum digunakan.

---

# 🎯 Tujuan Project

Project ini bertujuan untuk:

- Membangun REST API yang terstruktur
- Mengimplementasikan komunikasi real-time menggunakan Socket.IO
- Menerapkan JWT Authentication
- Menggunakan ORM (Drizzle ORM)
- Menggunakan PostgreSQL sebagai database
- Mengikuti workflow Git dan GitHub yang mendekati standar industri

---

# 🛠️ Teknologi yang Digunakan

## Runtime

- Node.js

## Framework

- Express.js

## Database

- PostgreSQL

## ORM

- Drizzle ORM

## Real-time Communication

- Socket.IO

## Authentication

- JSON Web Token (JWT)

## Password Hashing

- bcrypt

## Validation

- Zod

## File Upload

- Multer

## Environment Variable

- dotenv

## Security

- Helmet
- Express Rate Limit
- CORS

## Version Control

- Git
- GitHub

---

# 📦 Struktur Arsitektur

Project menggunakan arsitektur **Modular (Feature-Based Architecture)**.

Setiap fitur memiliki folder sendiri yang berisi:

- Route
- Controller
- Service
- Validator

Dengan struktur ini, setiap modul dapat dikembangkan secara terpisah sehingga lebih mudah dipelihara.

---

# 🗄️ Database

Database menggunakan PostgreSQL.

Tabel utama:

- users
- refresh_tokens
- conversations
- conversation_members
- messages
- message_reactions
- message_status
- notifications
- blocked_users
- audit_logs

Seluruh tabel dibuat menggunakan Drizzle ORM.

---

# 🔐 Authentication Flow

1. User melakukan Register.
2. Password di-hash menggunakan bcrypt.
3. Data user disimpan ke database.
4. User melakukan Login.
5. Server memverifikasi email dan password.
6. Server membuat Access Token dan Refresh Token.
7. Access Token digunakan untuk mengakses endpoint yang membutuhkan autentikasi.
8. Saat Access Token habis, Refresh Token digunakan untuk meminta Access Token baru.
9. Logout menghapus Refresh Token dari database sehingga sesi tidak dapat digunakan kembali.

---

# 💬 Alur Chat

## Private Chat

1. User memilih pengguna lain.
2. Server membuat atau mengambil conversation bertipe PRIVATE.
3. Kedua user tergabung ke room Socket.IO.
4. User mengirim pesan.
5. Pesan disimpan ke database.
6. Server mengirim event `message:new`.
7. Semua anggota room menerima pesan secara real-time.
8. Status pesan berubah menjadi Delivered dan Seen sesuai aktivitas penerima.

---

## Group Chat

1. User membuat grup.
2. Creator otomatis menjadi Group Admin.
3. Admin dapat menambah atau menghapus anggota.
4. Semua anggota tergabung pada room Socket.IO grup.
5. Pesan dikirim ke seluruh anggota grup secara real-time.
6. Status pesan diperbarui untuk setiap anggota.

---

# ⚡ Socket.IO Flow

Saat aplikasi dijalankan:

1. Client terhubung ke Socket.IO Server.
2. Client mengirim Access Token.
3. Middleware memverifikasi JWT.
4. Jika valid, koneksi diterima.
5. User dapat bergabung ke room conversation.
6. Seluruh event real-time diproses melalui Socket.IO.

Event utama:

- room:join
- room:leave
- message:send
- message:new
- message:edit
- message:delete
- message:status
- typing:start
- typing:stop
- presence:update
- notification:new
- group:update

---

# 🌐 REST API

REST API digunakan untuk:

- Authentication
- User Profile
- Conversation
- Group
- Notification
- Search

Sedangkan Socket.IO digunakan untuk seluruh komunikasi real-time.

---

# 🔄 Alur Request

```text
Client
    │
    ▼
Express Route
    │
    ▼
Controller
    │
    ▼
Service
    │
    ▼
Drizzle ORM
    │
    ▼
PostgreSQL
    │
    ▼
Response
```

---

# ⚡ Alur Socket.IO

```text
Client
    │
    ▼
Socket.IO Server
    │
    ▼
Authentication (JWT)
    │
    ▼
Join Room
    │
    ▼
Message Handler
    │
    ▼
Database
    │
    ▼
Broadcast
    │
    ▼
Semua User dalam Room
```

---

# 🚀 Git Workflow

Project menggunakan workflow Git sederhana yang mendekati praktik industri.

```text
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
      ├── feature/notifications
      ├── feature/search
      ├── feature/postman
      └── feature/deployment
```

Semua fitur dikembangkan pada branch `feature/*`, kemudian di-merge ke `develop`, dan setelah stabil di-merge ke `main`.

---

# 📋 Fitur

- ✅ Register
- ✅ Login
- ✅ Logout
- ✅ Refresh Token
- ✅ Forgot Password
- ✅ Reset Password
- ✅ Edit Profile
- ✅ Upload Avatar
- ✅ Private Chat
- ✅ Group Chat
- ✅ Reply Message
- ✅ Edit Message
- ✅ Delete Message
- ✅ Message Status
- ✅ Typing Indicator
- ✅ Presence
- ✅ Notification
- ✅ Search
- ✅ Block User
- ✅ Audit Log

---

# 📚 Arsitektur yang Digunakan

- Modular Architecture (Feature-Based)
- REST API
- Socket.IO Real-Time Communication
- JWT Authentication
- Layered Architecture (Route → Controller → Service → Database)

---

# 👨‍💻 Developer

Backend dikembangkan menggunakan JavaScript dengan fokus pada:

- Clean Code
- Modular Architecture
- Reusable Components
- RESTful API
- Real-Time Communication
- Git Workflow
- Dokumentasi yang terstruktur