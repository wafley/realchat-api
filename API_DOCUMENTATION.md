# RealChat API Documentation

## Base URL

```
http://{{BACKEND_IP}}:3000/api
```

> Ganti `{{BACKEND_IP}}` dengan IP lokal backend developer.
> Cek via `ipconfig` (Windows) atau `ifconfig` (Mac/Linux).
> Server listen di `0.0.0.0` — bisa diakses device lain dalam satu jaringan.

---

## Auth — Token Based

### Tokens

| Token | Expires | Pemakaian |
|-------|---------|-----------|
| `accessToken` | 15 menit | Header `Authorization: Bearer <accessToken>` |
| `refreshToken` | 7 hari | Disimpan di client, untuk refresh token |

### Flow

```
Login → dapat accessToken + refreshToken
  ↓
Setiap request pakai header Authorization: Bearer <accessToken>
  ↓
Kalau response 401 → accessToken expired
  ↓
Panggil POST /auth/refresh { refreshToken } → dapat accessToken baru
  ↓
Ulang request yang gagal
```

---

## Response Format

### Success (200/201)

```json
{
  "success": true,
  "message": "Operation successful",
  "data": {}
}
```

### Error (400/401/403/404/409/500)

```json
{
  "success": false,
  "message": "Error description"
}
```

### Validation Error (400)

```json
{
  "success": false,
  "message": "Validation failed",
  "errors": [
    { "field": "email", "message": "Invalid email" }
  ]
}
```

---

## Endpoints

### Auth (public)

| Method | Endpoint | Body | Response |
|--------|----------|------|----------|
| POST | `/auth/register` | `{ username, email, password, fullName? }` | 201 — user data |
| POST | `/auth/login` | `{ email, password }` | 200 — tokens + user |
| POST | `/auth/refresh` | `{ refreshToken }` | 200 — new tokens |
| POST | `/auth/logout` | `{ refreshToken }` | 200 — success |
| POST | `/auth/forgot-password` | `{ email }` | 200 — success |
| POST | `/auth/reset-password` | `{ token, password }` | 200 — success |
| POST | `/auth/verify-email` | `{ token }` | 200 — success |

### Users (Bearer required)

| Method | Endpoint | Body/Params | Response |
|--------|----------|-------------|----------|
| GET | `/users/me` | — | 200 — profile |
| PUT | `/users/me` | `{ username?, fullName?, bio?, statusText? }` | 200 — updated profile |
| GET | `/users/:id` | `:id` (uuid) | 200 — public profile |
| PUT | `/users/me/avatar` | `avatar` (multipart file) | 200 — updated profile |
| PUT | `/users/me/password` | `{ oldPassword, newPassword }` | 200 — success |

### Conversations (Bearer required)

| Method | Endpoint | Body/Params | Response |
|--------|----------|-------------|----------|
| POST | `/conversations` | `{ type: 'PRIVATE', participantId }` (PRIVATE only — buat grup pakai `POST /groups`) | 201 — conversation |
| GET | `/conversations` | `?search=&cursor=&limit=20` | 200 — `{ conversations, nextCursor }` |
| GET | `/conversations/:id` | `:id` (uuid) | 200 — detail + members |
| DELETE | `/conversations/:id` | `:id` (uuid) | 200 — left conversation |
| PATCH | `/conversations/:id/clear` | — | 200 — `{ clearedAt }` set `cleared_at` milik user (hide-per-user) |
| PUT | `/conversations/:id/mute` | `{ until? }` (ISO datetime) | 200 — `{ mutedUntil }` mute conversation (per-user) |
| DELETE | `/conversations/:id/mute` | — | 200 — `{ mutedUntil: null }` unmute |

> **`GET /conversations/:id` — detail:** tiap item `members` kini membawa `user: { id, username, fullName, avatarUrl, isOnline, lastSeenAt }` (join ke tabel `users`), selain kolom member (`userId`, `role`, `joinedAt`, `mutedUntil`, `clearedAt`). `lastSeenAt` berupa ISO string atau `null`.

> **`GET /conversations` — chat list:**
> - `search?` — filter by `conversations.name`, peer `username`/`fullName`, `customName`, atau isi last message.
> - `cursor?` — **composite cursor** `base64url("<sortKey ISO>|<conversationId>")` dari `nextCursor` halaman sebelumnya (keyset pagination `(sortKey, id)`).
> - `limit?` — 1–50, default 20.
> - `unreadCount` — jumlah pesan masuk (dari user lain) dengan status belum `SEEN`, dihitung dari `message_status`. Pesan `SYSTEM` dan pesan sendiri tidak dihitung. Turun (bisa `0`) saat mark-read `POST /conversations/:id/read` atau clear `PATCH /conversations/:id/clear`.
> - Diurutkan berdasarkan aktivitas terakhir (last message → dibuatnya conversation), terbaru dulu.
> - `search` mencocokkan nama conversation, `username`/`full name` peer, `customName`, atau isi last message. Karakter wildcard (`%`, `_`) dianggap literal.
> - `displayName`: **PRIVATE** = `customName` → full name peer → username peer → `'Unknown'`; **GROUP** = `name`.
> - `lastMessage.sender` hanya untuk **PRIVATE**; `isOnline`/`lastSeenAt` hanya untuk **PRIVATE**; `memberCount` hanya untuk **GROUP**; `myRole`/`mutedUntil`/`clearedAt` dari membership milikku.
>
> **Mute (`PUT/DELETE /conversations/:id/mute`):** per-user, hanya mengubah membership sendiri. `PUT` dengan `until` (ISO, harus di masa depan) → `mutedUntil` = waktu tersebut; **tanpa `until` = mute permanen** (dipetakan ke `now() + 10 tahun` — FE harus memperlakukan `mutedUntil` yang jauh ke masa depan sebagai **"permanen"**, bukan jadwal auto-unmute). `DELETE` mengembalikan `mutedUntil` ke `null` (unmuted). Belum ada enforcement notifikasi push (menyusul di fitur notifikasi); badge unread tetap dihitung untuk conversation yang di-mute.
>
> **Contoh response `GET /conversations`:**
> ```json
> {
>   "conversations": [
>     {
>       "id": "uuid",
>       "type": "PRIVATE",
>       "name": null,
>       "avatarUrl": null,
>       "description": null,
>       "createdBy": "uuid",
>       "createdAt": "2026-08-06T09:46:23.324Z",
>       "displayName": "bob",
>       "avatar": null,
>       "isOnline": false,
>       "lastSeenAt": "2026-08-05T09:00:37.211Z",
>       "memberCount": null,
>       "myRole": "MEMBER",
>       "mutedUntil": null,
>       "clearedAt": null,
>       "unreadCount": 0,
>       "lastMessage": {
>         "id": "uuid",
>         "content": "halo!",
>         "type": "TEXT",
>         "senderId": "uuid",
>         "sender": { "username": "bob", "fullName": "Bob D", "avatarUrl": null },
>         "createdAt": "2026-08-06T09:46:29.381Z",
>         "isDeleted": false
>       }
>     },
>     {
>       "id": "uuid",
>       "type": "GROUP",
>       "name": "Squad",
>       "avatarUrl": null,
>       "description": null,
>       "createdBy": "uuid",
>       "createdAt": "2026-08-06T09:48:05.031Z",
>       "displayName": "Squad",
>       "avatar": null,
>       "isOnline": null,
>       "lastSeenAt": null,
>       "memberCount": 3,
>       "myRole": "ADMIN",
>       "mutedUntil": null,
>       "clearedAt": null,
>       "unreadCount": 0,
>       "lastMessage": null
>     }
>   ],
>   "nextCursor": null
> }
> ```

### Messages (Bearer required)

| Method | Endpoint | Body/Params | Response |
|--------|----------|-------------|----------|
| GET | `/conversations/:id/messages` | `?cursor=&limit=50` | 200 — paginated messages |
| GET | `/conversations/:id/pinned` | `?limit=50` | 200 — `{ messages }` daftar pesan terpin |
| PUT | `/conversations/:id/messages/:messageId` | `{ content }` | 200 — edited message |
| DELETE | `/conversations/:id/messages/:messageId` | — | 200 — deleted |
| PUT | `/conversations/:id/messages/:messageId/pin` | — | 200 — `{ isPinned: true }` (broadcast `message:pin:updated`) |
| DELETE | `/conversations/:id/messages/:messageId/pin` | — | 200 — `{ isPinned: false }` |
| POST | `/conversations/:id/messages/:messageId/forward` | `{ targetConversationId }` | 201 — forwarded message (broadcast `message:new`) |
| PUT | `/conversations/:id/messages/:messageId/star` | — | 200 — `{ starredAt }` star pesan (per-user, privat) |
| DELETE | `/conversations/:id/messages/:messageId/star` | — | 200 — `{ starredAt: null }` |
| GET | `/messages/starred` | `?cursor=&limit=50` | 200 — `{ messages, nextCursor }` semua pesan ter-star milik user |
| POST | `/conversations/:id/read` | — | 200 — `{ updated, seenAt }` tandai semua pesan masuk SEEN |

> **`GET /conversations/:id/messages`:** tiap message kini membawa `sender: { username, fullName, avatarUrl }` (join ke tabel `users`), selain `status` (`SENT`/`DELIVERED`/`SEEN`), `seenAt`, `isStarred`, `starredAt`. Event socket `message:new` (send, forward, SYSTEM) memakai shape yang sama.

> **`GET /conversations/:id/pinned`:** diurutkan `pinnedAt` DESC — pesan yang paling baru di-pin tampil pertama. `pinnedAt` hanya bergeser saat pin/unpin, sehingga mengedit pesan terpin tidak mengubah urutan. Unpin menyetel `pinnedAt` ke `null`. Pesan tipe `SYSTEM` tidak dapat di-pin dan dikecualikan dari daftar.
>
> **Star — `message_stars` (per-user, privat):** tiap message pada `GET /conversations/:id/messages` kini membawa `isStarred` (bool) dan `starredAt`. `GET /messages/starred` menampilkan detil pesan + `sender` + `conversation`, diurutkan `starredAt` DESC. Pesan `SYSTEM` / `isDeleted` tidak dapat di-star baru, tapi star yang sudah ada **tidak otomatis dihapus** — pesan yang di-*soft delete* / di-*clear* **tetap muncul** di daftar starred (`isDeleted: true`, `content: ""` → FE render placeholder). Event socket `message:star:updated` (`{ messageId, isStarred, starredAt }`) **hanya dikirim ke room `user:<userId>`** (privasi star).

### Groups (Bearer required)

| Method | Endpoint | Body/Params | Response |
|--------|----------|-------------|----------|
| POST | `/groups` | multipart: `name`, `participantIds` (JSON string array, min 2), `description?`, `avatar?` (file) | 201 — created group (creator = ADMIN) |
| PUT | `/groups/:id` | `{ name?, description? }` | 200 — updated group |
| PUT | `/groups/:id/avatar` | `avatar` (multipart file) | 200 — updated group |
| POST | `/groups/:id/members` | `{ userIds: string[] }` (unik, ≥ 1, semua verified) | 200 — added members |
| DELETE | `/groups/:id/members/:userId` | `:userId` (uuid) | 200 — removed |
| PUT | `/groups/:id/members/:userId/role` | `{ role }` | 200 — updated |
| DELETE | `/groups/:id/leave` | — | 200 — left group (member terakhir → grup di-dismiss) |
| DELETE | `/groups/:id` | — | 200 — group dismissed (admin only, permanent) |

> **SYSTEM messages otomatis:** event grup tertentu menghasilkan pesan tipe `SYSTEM` (broadcast via `message:new`):
> - buat grup → `<nama> created the group` · tambah member → `<nama> added <nama-nama>` · hapus member → `<nama> removed <target>` · keluar grup → `<nama> left the group` · ubah role → `<nama> made <target> admin` / `<nama> demoted <target> to member` (termasuk promosi otomatis saat admin terakhir leave) · rename → `<nama> changed the group name to '<name>'`.
> - Pesan `SYSTEM` **tidak memiliki `message_status`** → **tidak menambah `unreadCount`**; tidak bisa di-pin/star (ditolak 400); tetap tampil normal di thread chat (`sender` = aktor aksi).
>
> **`POST /groups` (create):** multipart `name` + `participantIds` (min 2, total ≥ 3) + optional `description` / `avatar`. Creator jadi `ADMIN`. Setelah create, broadcast `group:created` `{ conversationId, name }` ke room `user:<id>` tiap member (FE lalu `group:join`). GROUP dari `POST /conversations` **dipindah ke sini** — `POST /conversations` kini hanya PRIVATE.
>
> **Limit, validasi & pembubaran:**
> - `MAX_GROUP_MEMBERS = 50` — total member grup (saat create maupun add) dibatasi.
> - `POST /groups/:id/members`: `userIds` harus **unik** (duplikat → 400) dan semua user harus **verified** (unverified → 400), konsisten dengan `POST /groups`.
> - `DELETE /groups/:id/leave`: jika admin terakhir leave, member MEMBER pertama di-promote menjadi `ADMIN` (broadcast `group:member-role-changed` + SYSTEM message). Jika **member terakhir** leave, grup otomatis di-dismiss (conversation + notifikasi dihapus, file avatar dihapus, leaver menerima `group:dismissed`).
> - `DELETE /groups/:id` (dismiss, admin only, permanen): hapus conversation beserta messages/members/status/reactions/stars/notifications (cascade DB); semua socket dipaksa keluar room; file avatar dihapus; broadcast `group:dismissed` `{ conversationId }` ke semua member.
> - Socket member yang di-kick (remove) atau leave dipaksa keluar room `conversation:<id>` — tidak akan menerima pesan setelahnya.

### Contacts (Bearer required)

| Method | Endpoint | Body/Params | Response |
|--------|----------|-------------|----------|
| POST | `/contacts/by-username` | `{ username, customName? }` | 201 — contact added |
| POST | `/contacts/bulk` | `{ userIds: string[] }` (max 100) | 200 — added contacts |
| PATCH | `/contacts/:userId` | `{ customName }` | 200 — custom name updated |
| DELETE | `/contacts/:userId` | `:userId` (uuid) | 200 — contact removed |
| GET | `/contacts` | `?search=&sort=recent\|alphabetical` | 200 — my contacts |
| GET | `/contacts/:userId` | `:userId` (uuid) | 200 — `{ isContact: boolean }` |
| GET | `/users/:userId/relationship` | `:userId` (uuid) | 200 — `{ status }` (`mutual` / `added` / `added_you` / `none`) |

> **Konsep ala WhatsApp:** kontak ditambah via **username** (bukan UUID). `search` memfilter daftar kontak milik sendiri (cocok di `username`, `fullName`, atau `customName`). `customName` adalah label pribadi yang hanya terlihat oleh pemilik kontak.
>
> **Error `POST /contacts/by-username`:** `404 User not found` (username tidak ada), `409 User is already your contact` (duplikat), `400 Cannot add yourself` (menambah diri sendiri).

> **Contoh response `GET /contacts`** (tiap item):
> ```json
> {
>   "id": "uuid-target",
>   "username": "bob",
>   "fullName": "Bob D",
>   "avatarUrl": null,
>   "bio": null,
>   "isOnline": false,
>   "lastSeenAt": null,
>   "customName": "Si Bob",
>   "createdAt": "2026-08-05T00:00:00.000Z"
> }
> ```

### Notifications (Bearer required)

| Method | Endpoint | Body/Params | Response |
|--------|----------|-------------|----------|
| GET | `/notifications` | `?limit=&offset=` | 200 — notifications + totalUnread |
| GET | `/notifications/unread-count` | — | 200 — `{ count }` |
| PUT | `/notifications/read-all` | — | 200 — success |
| PUT | `/notifications/:id/read` | `:id` (uuid) | 200 — marked read |

---

### Search & DM Search (Bearer required)

| Method | Endpoint | Body/Params | Response |
|--------|----------|-------------|----------|
| GET | `/search/users` | `?q=&limit=50` | 200 — `{ users }` cari user by username/fullName (verified) |
| GET | `/search/groups` | `?q=&cursor=&limit=50` | 200 — `{ groups, nextCursor }` cari grup milik user by nama + `memberCount` (hanya grup yang diikuti) |
| GET | `/search/messages` | `?q=&conversationId=&before=&after=&cursor=&limit=50` | 200 — `{ messages, nextCursor }` cari pesan (dalam satu conversation atau semua punya user) |
| GET | `/dm/search` | `?q=&cursor=&limit=50` | 200 — `{ messages, nextCursor }` cari pesan di semua DM user → `[{ messageId, conversationId, conversationName, senderId, senderName, content, createdAt }]` |

> **Pencarian** memakai `ILIKE` dengan escaping `\ % _`; `before`/`after` adalah filter timestamp ISO (`created_at`); hasil kosong = array kosong (bukan error).

---

## Socket Events

### Connection

```ts
const socket = io('http://{{BACKEND_IP}}:3000', {
  auth: { token: '<accessToken>' },
});
```

### Client → Server

| Event | Payload | Description |
|-------|---------|-------------|
| `message:send` | `{ conversationId, content, replyToId? }` | Send a message |
| `message:seen` | `{ conversationId, lastSeenMessageId }` | Mark messages as seen (read receipts) |
| `message:delete` | `{ conversationId, messageId }` | Delete a message |
| `message:pin` | `{ messageId }` | Pin a message (broadcast ke room) |
| `message:unpin` | `{ messageId }` | Unpin a message (broadcast ke room) |
| `message:reaction:add` | `{ messageId, emoji }` | Add a reaction (toggle via add/remove) |
| `message:reaction:remove` | `{ messageId, emoji }` | Remove own reaction |
| `message:star` | `{ messageId }` | Star a message (privat, hanya user) |
| `message:unstar` | `{ messageId }` | Unstar a message (privat, hanya user) |
| `typing:start` | `{ conversationId }` | User started typing |
| `typing:stop` | `{ conversationId }` | User stopped typing |
| `group:join` | `{ conversationId }` | Join a group room |
| `group:leave` | `{ conversationId }` | Leave a group room |

### Server → Client

| Event | Payload | Description |
|-------|---------|-------------|
| `message:new` | Row pesan penuh (id, conversationId, senderId, type, content, replyToId, isPinned, isEdited, isDeleted, editedAt, createdAt, updatedAt) **+ `sender: { username, fullName, avatarUrl }`** | Pesan baru di conversation (SYSTEM & forward memakai shape sama) |
| `message:status` | `{ messageId, status: 'DELIVERED' \| 'SEEN', userId, seenAt }` | Status delivery/read untuk pengirim |
| `message:deleted` | `{ conversationId, messageId }` | Message deleted |
| `message:edited` | Row pesan penuh (termasuk `updatedAt`) | Message edited |
| `message:pin:updated` | `{ conversationId, messageId, isPinned }` | Message pin/unpin state changed |
| `message:reaction:updated` | `{ messageId, reactions: [{ emoji, userIds[] }] }` | Reaction state changed |
| `message:star:updated` | `{ messageId, isStarred, starredAt }` | Star state changed (**hanya ke room `user:<userId>`** — privat) |
| `typing:start` | `{ conversationId, userId }` | User started typing |
| `typing:stop` | `{ conversationId, userId }` | User stopped typing |
| `presence:online` | `{ userId }` | User came online |
| `presence:offline` | `{ userId, lastSeenAt }` | User went offline (with last seen time) |
| `group:created` | `{ conversationId, name }` | Grup baru dibuat (ke tiap member) |
| `group:updated` | Row conversation penuh (id, type, name, avatarUrl, description, createdBy, createdAt) | Group info updated |
| `group:avatar-updated` | Row conversation penuh (id, type, name, avatarUrl, description, createdBy, createdAt) | Group avatar changed |
| `group:member-added` | `{ conversationId, addedBy }` (ke member baru) atau `{ conversationId, newMembers, addedBy }` (ke member lama) | New members added |
| `group:member-removed` | `{ conversationId, removedBy }` (ke yang dihapus/keluar) atau `{ conversationId, targetUserId, removedBy }` (ke member tersisa) | Member removed |
| `group:member-role-changed` | `{ conversationId, targetUserId, newRole, changedBy }` | Member role changed (via `PUT .../role` **dan** promosi otomatis saat admin terakhir leave) |
| `group:dismissed` | `{ conversationId }` | Grup di-dismiss permanen (ke tiap member) |
| `contact:new` | `{ contact: { id, username, fullName, avatarUrl } }` | Someone added you as contact |
| `contact:remove` | `{ userId }` | Someone removed you from their contacts |
| `notification:new` | `{ notification }` | New notification |

> `notification.type` yang ada: `new_contact`, `group_invite` (dibuat ke peserta saat grup dibuat atau member ditambahkan; body `@admin ...`), `mention` (di pesan grup saja, saat user disebut `@username`; berisi `actorId`, `conversationId`, `messageId`).

---

## Example: Fetch Helper with Auto-Refresh

```js
const API_BASE = 'http://{{BACKEND_IP}}:3000/api';

async function apiFetch(path, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${localStorage.getItem('accessToken')}`,
    ...options.headers,
  };

  let res = await fetch(API_BASE + path, { ...options, headers });

  if (res.status === 401) {
    const refreshRes = await fetch(API_BASE + '/auth/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: localStorage.getItem('refreshToken') }),
    });

    if (refreshRes.ok) {
      const { data } = await refreshRes.json();
      localStorage.setItem('accessToken', data.accessToken);
      localStorage.setItem('refreshToken', data.refreshToken);
      headers.Authorization = `Bearer ${data.accessToken}`;
      res = await fetch(API_BASE + path, { ...options, headers });
    } else {
      localStorage.clear();
      window.location.href = '/login';
    }
  }

  return res.json();
}

// Usage
const login = await apiFetch('/auth/login', {
  method: 'POST',
  body: JSON.stringify({ email: '...', password: '...' }),
});

const myProfile = await apiFetch('/users/me');
const conversations = await apiFetch('/conversations');
const messages = await apiFetch('/conversations/123/messages?limit=50');
```
