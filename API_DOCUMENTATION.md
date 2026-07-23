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
| POST | `/auth/register` | `{ username, email, password }` | 201 — user data |
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
| PUT | `/users/me` | `{ username?, bio?, statusText? }` | 200 — updated profile |
| GET | `/users/:id` | `:id` (uuid) | 200 — public profile |
| GET | `/users/search?q=` | `?q=` (query) | 200 — user list (max 20) |
| PUT | `/users/me/avatar` | `avatar` (multipart file) | 200 — updated profile |
| PUT | `/users/me/password` | `{ oldPassword, newPassword }` | 200 — success |

### Conversations (Bearer required)

| Method | Endpoint | Body/Params | Response |
|--------|----------|-------------|----------|
| POST | `/conversations` | `{ type, participantId }` or `{ type, name, participantIds }` | 201 — conversation |
| GET | `/conversations` | — | 200 — list with last message |
| GET | `/conversations/:id` | `:id` (uuid) | 200 — detail + members |
| DELETE | `/conversations/:id` | `:id` (uuid) | 200 — left conversation |

### Messages (Bearer required)

| Method | Endpoint | Body/Params | Response |
|--------|----------|-------------|----------|
| GET | `/conversations/:id/messages` | `?cursor=&limit=50` | 200 — paginated messages |
| POST | `/conversations/:id/messages` | `{ content, replyToId? }` | 201 — message |
| PUT | `/conversations/:id/messages/:messageId` | `{ content }` | 200 — edited message |
| DELETE | `/conversations/:id/messages/:messageId` | — | 200 — deleted |

### Groups (Bearer required)

| Method | Endpoint | Body/Params | Response |
|--------|----------|-------------|----------|
| PUT | `/groups/:id` | `{ name?, description? }` | 200 — updated group |
| PUT | `/groups/:id/avatar` | `avatar` (multipart file) | 200 — updated group |
| POST | `/groups/:id/members` | `{ userIds: string[] }` | 200 — added members |
| DELETE | `/groups/:id/members/:userId` | `:userId` (uuid) | 200 — removed |
| PUT | `/groups/:id/members/:userId/role` | `{ role }` | 200 — updated |
| DELETE | `/groups/:id/leave` | — | 200 — left group |

### Friends (Bearer required)

| Method | Endpoint | Body/Params | Response |
|--------|----------|-------------|----------|
| GET | `/friends` | — | 200 — friends list |
| POST | `/friends/request` | `{ userId }` | 201 — request sent |
| GET | `/friends/requests` | — | 200 — incoming requests |
| GET | `/friends/requests/sent` | — | 200 — sent requests |
| POST | `/friends/accept` | `{ requestId }` | 200 — accepted |
| POST | `/friends/reject` | `{ requestId }` | 200 — rejected |
| DELETE | `/friends/request/:userId` | `:userId` (uuid) | 200 — cancelled |
| DELETE | `/friends/:userId` | `:userId` (uuid) | 200 — unfriended |

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
| `typing:start` | `{ conversationId }` | User started typing |
| `typing:stop` | `{ conversationId }` | User stopped typing |

### Server → Client

| Event | Payload | Description |
|-------|---------|-------------|
| `message:new` | `{ conversationId, message }` | New message in conversation |
| `message:deleted` | `{ conversationId, messageId }` | Message deleted |
| `typing:start` | `{ conversationId, userId }` | User started typing |
| `typing:stop` | `{ conversationId, userId }` | User stopped typing |
| `presence:online` | `{ userId }` | User came online |
| `presence:offline` | `{ userId }` | User went offline |
| `group:updated` | `{ id, name?, description? }` | Group info updated |
| `group:avatar-updated` | `{ id, avatarUrl }` | Group avatar changed |
| `group:member-added` | `{ conversationId, members }` | New members added |
| `group:member-removed` | `{ conversationId, removedUserId }` | Member removed |
| `group:role-changed` | `{ conversationId, userId, role }` | Member role changed |
| `friend:request-received` | `{ request }` | Friend request received |
| `friend:request-cancelled` | `{ requestId }` | Request cancelled |
| `friend:request-accepted` | `{ request }` | Request accepted |
| `friend:request-rejected` | `{ request }` | Request rejected |
| `friend:unfriended` | `{ unfriendedBy }` | You were unfriended |

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
