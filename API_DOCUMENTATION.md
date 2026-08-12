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
| POST | `/conversations` | `{ type, participantId }` or `{ type, name, participantIds }` | 201 — conversation |
| GET | `/conversations` | `?search=&cursor=&limit=20` | 200 — `{ conversations, nextCursor }` |
| GET | `/conversations/:id` | `:id` (uuid) | 200 — detail + members |
| DELETE | `/conversations/:id` | `:id` (uuid) | 200 — left conversation |

> **`GET /conversations` — chat list:**
> - `search?` — filter by `conversations.name`, peer `username`/`fullName`, `customName`, atau isi last message.
> - `cursor?` — ISO timestamp dari `nextCursor` halaman sebelumnya (keyset pagination).
> - `limit?` — 1–50, default 20.
> - Diurutkan berdasarkan aktivitas terakhir (last message → dibuatnya conversation), terbaru dulu.
> - `search` mencocokkan nama conversation, `username`/`full name` peer, `customName`, atau isi last message. Karakter wildcard (`%`, `_`) dianggap literal.
> - `displayName`: **PRIVATE** = `customName` → full name peer → username peer → `'Unknown'`; **GROUP** = `name`.
> - `lastMessage.sender` hanya untuk **PRIVATE**; `isOnline`/`lastSeenAt` hanya untuk **PRIVATE**; `memberCount` hanya untuk **GROUP**; `myRole`/`mutedUntil`/`clearedAt` dari membership milikku.
> - `unreadCount` belum ada (menyusul di fitur read receipts).
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
| GET | `/conversations/:id/pinned` | `:id` (uuid) | 200 — `{ messages }` daftar pesan terpin |
| PUT | `/conversations/:id/messages/:messageId` | `{ content }` | 200 — edited message |
| DELETE | `/conversations/:id/messages/:messageId` | — | 200 — deleted |

> **`GET /conversations/:id/pinned`:** diurutkan `pinnedAt` DESC — pesan yang paling baru di-pin tampil pertama. `pinnedAt` hanya bergeser saat pin/unpin, sehingga mengedit pesan terpin tidak mengubah urutan. Unpin menyetel `pinnedAt` ke `null`. Pesan tipe `SYSTEM` tidak dapat di-pin dan dikecualikan dari daftar.

### Groups (Bearer required)

| Method | Endpoint | Body/Params | Response |
|--------|----------|-------------|----------|
| PUT | `/groups/:id` | `{ name?, description? }` | 200 — updated group |
| PUT | `/groups/:id/avatar` | `avatar` (multipart file) | 200 — updated group |
| POST | `/groups/:id/members` | `{ userIds: string[] }` | 200 — added members |
| DELETE | `/groups/:id/members/:userId` | `:userId` (uuid) | 200 — removed |
| PUT | `/groups/:id/members/:userId/role` | `{ role }` | 200 — updated |
| DELETE | `/groups/:id/leave` | — | 200 — left group |

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
| GET | `/search/groups` | `?q=&limit=50` | 200 — `{ groups }` cari grup by nama + `memberCount` |
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
| `message:delete` | `{ conversationId, messageId }` | Delete a message |
| `message:pin` | `{ messageId }` | Pin a message (broadcast ke room) |
| `message:unpin` | `{ messageId }` | Unpin a message (broadcast ke room) |
| `typing:start` | `{ conversationId }` | User started typing |
| `typing:stop` | `{ conversationId }` | User stopped typing |
| `group:join` | `{ conversationId }` | Join a group room |
| `group:leave` | `{ conversationId }` | Leave a group room |

### Server → Client

| Event | Payload | Description |
|-------|---------|-------------|
| `message:new` | `{ conversationId, message }` | New message in conversation |
| `message:status` | `{ messageId, status: 'DELIVERED' \| 'SEEN', userId, seenAt }` | Message delivery/read status for the sender |
| `message:deleted` | `{ conversationId, messageId }` | Message deleted |
| `message:pin:updated` | `{ conversationId, messageId, isPinned }` | Message pin/unpin state changed |
| `typing:start` | `{ conversationId, userId }` | User started typing |
| `typing:stop` | `{ conversationId, userId }` | User stopped typing |
| `presence:online` | `{ userId }` | User came online |
| `presence:offline` | `{ userId, lastSeenAt }` | User went offline (with last seen time) |
| `group:updated` | `{ id, name?, description? }` | Group info updated |
| `group:avatar-updated` | `{ id, avatarUrl }` | Group avatar changed |
| `group:member-added` | `{ conversationId, members }` | New members added |
| `group:member-removed` | `{ conversationId, removedUserId }` | Member removed |
| `group:role-changed` | `{ conversationId, userId, role }` | Member role changed |
| `contact:new` | `{ contact: { id, username, fullName, avatarUrl } }` | Someone added you as contact |
| `contact:remove` | `{ userId }` | Someone removed you from their contacts |
| `notification:new` | `{ notification }` | New notification |

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
