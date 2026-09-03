# RealChat API

Backend service for RealChat, a real-time chat application built with **Node.js, Express, TypeScript, PostgreSQL (Drizzle ORM), and Socket.IO**. Provides a REST API and WebSocket communication for authentication (incl. Google OAuth), user management, private & group chat, message reactions, forwarding, search, file uploads, and OneSignal push notifications.

**Status: Stable — v1.0.0**

## Tech Stack

- **Node.js** (>= 22) & **npm** (>= 10)
- **Express.js** — HTTP API + middleware (helmet, cors, compression)
- **TypeScript** — type-safe codebase, run via `tsx` (dev) / compiled via `tsc` (build)
- **PostgreSQL** (>= 16) with **Drizzle ORM** — schema, migrations, queries
- **Socket.IO** — realtime events (messages, presence, typing, reactions, pin/star)
- **Zod** — request validation (most write routes are `.strict()`)
- **Multer** — file/image/video upload with magic-bytes validation
- **JSON Web Token (JWT)** — access + rotating refresh tokens
- **Google OAuth** — login/register via Google
- **OneSignal** — push notifications for offline recipients
- **Nodemailer** — transactional email (verification, password reset)

## Requirements

- Node.js >= 22
- PostgreSQL >= 16
- npm >= 10

## Installation

```bash
npm install
```

## Environment

Copy the example environment file and fill in the values:

```bash
cp .env.example .env
```

Key variables:

| Variable | Description |
|----------|-------------|
| `PORT` | Server port (default 3000) |
| `NODE_ENV` | `development` / `production` |
| `DATABASE_URL` | PostgreSQL connection string |
| `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` | Secrets for signing tokens |
| `JWT_ACCESS_EXPIRES_IN` / `JWT_REFRESH_EXPIRES_IN` | Token TTL (e.g. `15m`, `7d`) |
| `FRONTEND_URL` | Frontend origin (OAuth redirect target) |
| `CORS_ORIGIN` | Comma-separated allowed origins |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` | Transactional email |
| `ONESIGNAL_APP_ID` / `ONESIGNAL_REST_API_KEY` | OneSignal push (empty = push disabled/dry-run) |
| `UPLOAD_DIR` / `MAX_FILE_SIZE` | Upload storage & attachment size limit |
| `TRUST_PROXY` | Proxy hop count (0 direct, 1 behind nginx/LB) |
| `MESSAGE_*` / `TYPING_*` / `SEEN_*` / `PIN_*` / `REACTION_*` / `STAR_*` | Socket rate/throttle tuning |

See `.env.example` for the complete list with comments.

## Database

Generate the schema and run migrations:

```bash
npm run db:generate   # generate a new migration from schema changes
npm run db:migrate    # apply pending migrations
```

(Optional) Seed the database with sample data:

```bash
npm run seed
```

## Development

```bash
npm run dev        # tsx watch — hot reload
```

## Build & Start (production)

```bash
npm run build      # type-check + compile to dist/
npm run start      # node dist/server.js
```

## Lint & Format

```bash
npm run lint           # eslint src/ scripts/
npm run lint:fix
npm run format         # prettier --write
npm run format:check
```

## Features

- **Authentication**: register, login, JWT access/refresh rotation, logout, email verification, forgot/reset password, delete account, **Google OAuth**
- **Users**: profile update, avatar/banner upload, change/set password (incl. OAuth users), privacy settings, notification preferences, block/unblock, relationships
- **Private Chat**: DM creation, messages, read receipts (SENT/DELIVERED/SEEN), typing, mute, clear, hide
- **Group Chat**: create (with members + avatar), update, add/remove members, roles (ADMIN/MEMBER), auto-admin promotion, dismiss, system messages, delete-for-everyone (admin)
- **Messages**: text & attachment (image/video) sending, edit, delete, **forward (with `isForwarded` / `forwardCount`)**, pin, star, reactions, reply
- **Search**: users, groups, messages, and DM messages (ILIKE with escaping, keyset cursor pagination)
- **Realtime (Socket.IO)**: `message:new`/`edited`/`deleted`/`status`, `typing:*`, presence, reactions, pin, star, group events, notifications
- **Push Notifications**: OneSignal for offline recipients
- **Contacts**: add by username, bulk import, custom names, search/sort

## Project Structure

```
realchat-api/
├── scripts/            # utility/seed scripts
├── src/
│   ├── config/         # env + service config (incl. OneSignal)
│   ├── db/             # Drizzle schema + migrations
│   ├── middlewares/    # auth, validation, rate limiting, upload
│   ├── modules/        # feature modules (auth, users, conversations, groups,
│   │                   #   contacts, notifications, devices, search)
│   ├── routes/         # router aggregation (mounted under /api)
│   ├── socket/         # Socket.IO index + handlers
│   └── utils/          # shared helpers & errors
├── uploads/            # uploaded media
├── package.json
└── README.md
```

## API Documentation

- **REST API & Socket.IO events**: see [`API_DOCUMENTATION.md`](./API_DOCUMENTATION.md)
